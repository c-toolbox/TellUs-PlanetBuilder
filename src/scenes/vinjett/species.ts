const thumbnailImages = import.meta.glob<string>(
	"./textures/species/thumbnail/*.(jpg|jpeg|png|webp)",
	{ eager: true, import: "default" },
);

const trimmedImages = import.meta.glob<string>(
	"./textures/species/trimmed/*.(jpg|jpeg|png|webp)",
	{ eager: true, import: "default" },
);

function getImage(
	globMap: Record<string, string>,
	filenameWithExt: string,
): string {
	const match = Object.entries(globMap).find(([path]) =>
		path.endsWith(`/${filenameWithExt}`),
	);
	return match ? match[1] : "";
}

export interface Species {
	image: string; // Trimmed / Full image path
	thumbnail: string; // Thumbnail image path
	english: string;
	swedish: string;
}

const speciesData = {
	skallerorm: {
		file: "skallerorm.jpg",
		english: "Rattlesnake",
		swedish: "Skallerorm",
	},
	kolibakterie: {
		file: "kolibakterie.jpg",
		english: "E. coli",
		swedish: "Kolibakterie",
	},
	granitblock: {
		file: "granitblock.jpg",
		english: "Granite boulder",
		swedish: "Granitblock",
	},
	korsspindel: {
		file: "korsspindel.jpg",
		english: "European garden spider",
		swedish: "Korsspindel",
	},
	kantarell: {
		file: "kantarell.jpg",
		english: "Chanterelle",
		swedish: "Kantarell",
	},
	kanin: {
		file: "kanin.jpg",
		english: "Rabbit",
		swedish: "Kanin",
	},
	stor_daggmask: {
		file: "stor_daggmask.jpg",
		english: "Common earthworm",
		swedish: "Stor daggmask",
	},
	maskros: {
		file: "maskros.jpg",
		english: "Dandelion",
		swedish: "Maskros",
	},
	öronmanet: {
		file: "öronmanet.jpg",
		english: "Moon jellyfish",
		swedish: "Öronmanet",
	},
	isbjörn: {
		file: "isbjörn.jpg",
		english: "Polar bear",
		swedish: "Isbjörn",
	},
	abborre: {
		file: "abborre.jpg",
		english: "European perch",
		swedish: "Abborre",
	},
	vitsippa: {
		file: "vitsippa.jpg",
		english: "Wood anemone",
		swedish: "Vitsippa",
	},
	björnmossa: {
		file: "björnmossa.jpg",
		english: "Haircap moss",
		swedish: "Björnmossa",
	},
	brunt_stenblad: {
		file: "brunt_stenblad.jpg",
		english: "Brown living stone",
		swedish: "Brunt stenblad",
	},
	vandrande_pinne: {
		file: "vandrande_pinne.jpg",
		english: "Stick insect",
		swedish: "Vandrande pinne",
	},
	stafylokocker: {
		file: "stafylokocker.jpg",
		english: "Staphylococci",
		swedish: "Stafylokocker",
	},
	kartlav: {
		file: "kartlav.jpg",
		english: "Map lichen",
		swedish: "Kartlav",
	},
	bergskristall: {
		file: "bergskristall.jpg",
		english: "Rock crystal",
		swedish: "Bergskristall",
	},
	slagg: {
		file: "slagg.jpg",
		english: "Slag",
		swedish: "Slagg",
	},
	revormstörel: {
		file: "revormstörel.jpg",
		english: "Caper spurge",
		swedish: "Revormstörel",
	},
	guckusko: {
		file: "guckusko.jpg",
		english: "Lady's-slipper orchid",
		swedish: "Guckusko",
	},
	sjöpung: {
		file: "sjöpung.jpg",
		english: "Sea squirt",
		swedish: "Sjöpung",
	},
	havstulpan: {
		file: "havstulpan.jpg",
		english: "Barnacle",
		swedish: "Havstulpan",
	},
	kiselalg: {
		file: "kiselalg.jpg",
		english: "Diatom",
		swedish: "Kiselalg",
	},
	flugblomster: {
		file: "flugblomster.jpg",
		english: "Fly orchid",
		swedish: "Flugblomster",
	},
	grön_vårtbitare: {
		file: "grön_vårtbitare.jpg",
		english: "Great green bush-cricket",
		swedish: "Grön vårtbitare",
	},
	vårskål: {
		file: "vårskål.jpg",
		english: "Scarlet elf cup",
		swedish: "Vårskål",
	},
	thermus_aquaticus: {
		file: "thermus_aquaticus.jpg",
		english: "Thermus aquaticus",
		swedish: "Thermus aquaticus",
	},
	saguarokaktus: {
		file: "saguarokaktus.jpg",
		english: "Saguaro cactus",
		swedish: "Saguarokaktus",
	},
	schimpans: {
		file: "schimpans.jpg",
		english: "Chimpanzee",
		swedish: "Schimpans",
	},
	fossil: {
		file: "fossil.jpg",
		english: "Fossil",
		swedish: "Fossil",
	},
	koltrast: {
		file: "koltrast.jpg",
		english: "Common blackbird",
		swedish: "Koltrast",
	},
	nyponros: {
		file: "nyponros.jpg",
		english: "Dog rose",
		swedish: "Nyponros",
	},
	späckhuggare: {
		file: "späckhuggare.jpg",
		english: "Orca",
		swedish: "Späckhuggare",
	},
	gädda: {
		file: "gädda.jpg",
		english: "Northern pike",
		swedish: "Gädda",
	},
	sileshår: {
		file: "sileshår.jpg",
		english: "Sundew",
		swedish: "Sileshår",
	},
	blåsippa: {
		file: "blåsippa.jpg",
		english: "Hepatica",
		swedish: "Blåsippa",
	},
	röd_flugsvamp: {
		file: "röd_flugsvamp.jpg",
		english: "Fly agaric",
		swedish: "Röd flugsvamp",
	},
	grovslick: {
		file: "grovslick.jpg",
		english: "Rough red alga",
		swedish: "Grovslick",
	},
	jaguar: {
		file: "jaguar.jpg",
		english: "Jaguar",
		swedish: "Jaguar",
	},
	gräsand: {
		file: "gräsand.jpg",
		english: "Mallard",
		swedish: "Gräsand",
	},
	kaveldun: {
		file: "kaveldun.jpg",
		english: "Cattail",
		swedish: "Kaveldun",
	},
	trollslända: {
		file: "trollslända.jpg",
		english: "Dragonfly",
		swedish: "Trollslända",
	},
	svavelkristall: {
		file: "svavelkristall.jpg",
		english: "Sulfur crystal",
		swedish: "Svavelkristall",
	},
	prärievarg: {
		file: "prärievarg.jpg",
		english: "Coyote",
		swedish: "Prärievarg",
	},
	pilempid: {
		file: "pilempid.jpg",
		english: "Willow flycatcher",
		swedish: "Pilempid",
	},
	moapaspigg: {
		file: "moapaspigg.jpg",
		english: "Moapa dace",
		swedish: "Moapaspigg",
	},
	fjällräv: {
		file: "fjällräv.jpg",
		english: "Arctic fox",
		swedish: "Fjällräv",
	},
	tamduva: {
		file: "tamduva.jpg",
		english: "Domestic pigeon",
		swedish: "Tamduva",
	},
	brunråtta: {
		file: "brunråtta.jpg",
		english: "Brown rat",
		swedish: "Brunråtta",
	},
	mögel: {
		file: "mögel.jpg",
		english: "Mold",
		swedish: "Mögel",
	},
	lind: {
		file: "lind.jpg",
		english: "Linden",
		swedish: "Lind",
	},
	älg: {
		file: "älg.jpg",
		english: "Moose",
		swedish: "Älg",
	},
	rödräv: {
		file: "rödräv.jpg",
		english: "Red fox",
		swedish: "Rödräv",
	},
	blåbär: {
		file: "blåbär.jpg",
		english: "Bilberry",
		swedish: "Blåbär",
	},
	björk: {
		file: "björk.jpg",
		english: "Birch",
		swedish: "Björk",
	},
	ekorre: {
		file: "ekorre.jpg",
		english: "Red squirrel",
		swedish: "Ekorre",
	},
	skogsmyra: {
		file: "skogsmyra.jpg",
		english: "Wood ant",
		swedish: "Skogsmyra",
	},
	fisktärna: {
		file: "fisktärna.jpg",
		english: "Common tern",
		swedish: "Fisktärna",
	},
	plast: {
		file: "plast.jpg",
		english: "Plastic",
		swedish: "Plast",
	},
	makrill: {
		file: "makrill.jpg",
		english: "Mackerel",
		swedish: "Makrill",
	},
	havstrut: {
		file: "havstrut.jpg",
		english: "Great black-backed gull",
		swedish: "Havstrut",
	},
	sargassotång: {
		file: "sargassotång.jpg",
		english: "Sargassum",
		swedish: "Sargassotång",
	},
	vit_näckros: {
		file: "vit_näckros.jpg",
		english: "White water lily",
		swedish: "Vit näckros",
	},
	valross: {
		file: "valross.jpg",
		english: "Walrus",
		swedish: "Valross",
	},
	isalger: {
		file: "isalger.jpg",
		english: "Ice algae",
		swedish: "Isalger",
	},
	ismask: {
		file: "ismask.jpg",
		english: "Ice worm",
		swedish: "Ismask",
	},
	isranunkel: {
		file: "isranunkel.jpg",
		english: "Glacier buttercup",
		swedish: "Isranunkel",
	},
	skorpion: {
		file: "skorpion.jpg",
		english: "Scorpion",
		swedish: "Skorpion",
	},
	sandsten: {
		file: "sandsten.jpg",
		english: "Sandstone",
		swedish: "Sandsten",
	},
	härfågellärka: {
		file: "härfågellärka.jpg",
		english: "Greater hoopoe-lark",
		swedish: "Härfågellärka",
	},
	tukan: {
		file: "tukan.jpg",
		english: "Toucan",
		swedish: "Tukan",
	},
	passionsblomma: {
		file: "passionsblomma.jpg",
		english: "Passionflower",
		swedish: "Passionsblomma",
	},
	glasgroda: {
		file: "glasgroda.jpg",
		english: "Glass frog",
		swedish: "Glasgroda",
	},
	rådjur: {
		file: "rådjur.jpg",
		english: "Roe deer",
		swedish: "Rådjur",
	},
	mindre_skogsmus: {
		file: "mindre_skogsmus.jpg",
		english: "Wood mouse",
		swedish: "Mindre skogsmus",
	},
	vanlig_groda: {
		file: "vanlig_groda.jpg",
		english: "Common frog",
		swedish: "Vanlig groda",
	},
	strandkrabba: {
		file: "strandkrabba.jpg",
		english: "Short crab",
		swedish: "Strandkrabba",
	},
	vittrut: {
		file: "vittrut.jpg",
		english: "Glaucous gull",
		swedish: "Vittrut",
	},
	gråhäger: {
		file: "gråhäger.jpg",
		english: "Grey heron",
		swedish: "Gråhäger",
	},
	älggräs: {
		file: "älggräs.jpg",
		english: "Meadowsweet",
		swedish: "Älggräs",
	},
	stensopp: {
		file: "stensopp.jpg",
		english: "Penny bun",
		swedish: "Stensopp",
	},
	marulk: {
		file: "marulk.jpg",
		english: "Angler",
		swedish: "Marulk",
	},
	torsk: {
		file: "torsk.jpg",
		english: "Atlantic cod",
		swedish: "Torsk",
	},
	glassvamp: {
		file: "glassvamp.jpg",
		english: "Glass sponge",
		swedish: "Glassvamp",
	},
} as const;

export const species = Object.fromEntries(
	Object.entries(speciesData).map(([key, data]) => [
		key,
		{
			english: data.english,
			swedish: data.swedish,
			thumbnail: getImage(thumbnailImages, data.file),
			image: getImage(trimmedImages, data.file),
		},
	]),
) as Record<keyof typeof speciesData, Species>;

export type SpeciesKey = keyof typeof species;
