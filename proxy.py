import asyncio, json, threading, websockets
from pythonosc import osc_server, dispatcher


TUIO_CURSOR = "/tuio/2Dcur"
TUIO_OBJECT = "/tuio/2Dobj"
TUIO_BLOB = "/tuio/2Dblb"

TUIO_ALIVE = "alive"
TUIO_SET = "set"
TUIO_END = "fseq"
TUIO_SOURCE = "source"


tuio_queue = asyncio.Queue()
loop = None


# Default handler
def default_handler(address, *args):
    print("Unhandled:", address, args)


# Handles incoming TuIO messages from UDP and forwards to WebSocket.
def cur2d_handler(address, *args):
    if address != TUIO_CURSOR:
        return print("Unhandled TuIO address:", address)
    if len(args) == 0:
        raise Exception("No TUIO type specified")
    ttype = args[0]
    args = list(args[1:])
    message = None

    if ttype == TUIO_SOURCE:
        # source, 'SimpleSimulator@10.245.160.116'
        pass

    elif ttype == TUIO_ALIVE:
        # alive, [1, 2, 3]
        message = {
            "event": "alive",
            "ids": args,
        }

    elif ttype == TUIO_SET:
        # set, [id, position_x, position_y, velocity_x, velocity_y, motion_acceleration]
        message = {
            "event": "update",
            "id": args[0],
            "x": args[1],
            "y": args[2],
            "vx": args[3],
            "vy": args[4],
            "acc": args[5],
        }

    elif ttype == TUIO_END:
        # fseq, 56368
        pass

    else:
        raise Exception("Broken TUIO Package")

    # Put the message in the async queue
    if loop is not None and message:
        asyncio.run_coroutine_threadsafe(tuio_queue.put(message), loop)


# Start the OSC (TuIO) server on a separate thread.
def start_osc_server():
    disp = dispatcher.Dispatcher()
    disp.map("/tuio/2Dcur", cur2d_handler)
    disp.set_default_handler(default_handler)

    server = osc_server.ThreadingOSCUDPServer(("0.0.0.0", 3333), disp)
    print("Listening for TuIO on UDP port 3333...")
    server.serve_forever()


# Async function to send TuIO messages from queue to WebSocket clients
async def send_tuio_messages(websocket):
    active_ids = set()

    while True:
        message = await tuio_queue.get()  # Wait for new messages
        try:
            if message["event"] == "alive":
                current_ids = set(message["ids"])
                added_ids = current_ids - active_ids
                removed_ids = active_ids - current_ids

                for added_id in added_ids:
                    await websocket.send(json.dumps({"event": "add", "id": added_id}))

                for removed_id in removed_ids:
                    await websocket.send(
                        json.dumps({"event": "remove", "id": removed_id})
                    )

                active_ids = current_ids
            else:
                await websocket.send(json.dumps(message))
        except websockets.ConnectionClosedOK:
            break


async def handler(websocket):
    print("Client connected")
    send_task = asyncio.create_task(send_tuio_messages(websocket))

    try:
        while True:
            await websocket.recv()
    except websockets.ConnectionClosedOK:
        print("Client disconnected")
    finally:
        send_task.cancel()
        try:
            await send_task
        except asyncio.CancelledError:
            print("Send task cancelled")


async def main():
    global loop
    loop = asyncio.get_running_loop()

    async with websockets.serve(handler, "localhost", 8765):
        await asyncio.Future()  # Run forever


if __name__ == "__main__":
    threading.Thread(target=start_osc_server, daemon=True).start()
    print("Listening for WS on port 8765...")
    asyncio.run(main())
