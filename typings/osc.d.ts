declare module "osc" {
	type OscMessage = {
		address: string;
		args: unknown[];
	};

	type UdpPortOptions = {
		localAddress: string;
		localPort: number;
		metadata: boolean;
	};

	class UDPPort {
		constructor(options: UdpPortOptions);
		on(event: "message", listener: (message: OscMessage) => void): void;
		on(event: "ready" | "close", listener: () => void): void;
		on(event: "error", listener: (error: Error) => void): void;
		open(): void;
		close(): void;
	}

	const osc: { UDPPort: typeof UDPPort };
	export default osc;
}