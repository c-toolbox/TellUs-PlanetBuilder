const thumbnailImages = import.meta.glob<string>(
	"../../assets/species/thumbnail/*.(jpg|jpeg|png|webp)",
	{ eager: true, import: "default" },
);

const trimmedImages = import.meta.glob<string>(
	"../../assets/species/trimmed/*.(jpg|jpeg|png|webp)",
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
	rattlesnake: {
		file: "skallerorm.jpg",
		english: "Rattlesnake",
		swedish: "Skallerorm",
	},
	yeast: {
		file: "jast_kylskap.jpg",
		english: "Yeast",
		swedish: "Jäst",
	},
	eColi: {
		file: "ecoli.jpg",
		english: "E. coli",
		swedish: "Kolibakterie",
	},
	graniteBoulder: {
		file: "granitblock.jpg",
		english: "Granite boulder",
		swedish: "Granitblock",
	},
	gardenSpider: {
		file: "korsspindel.jpg",
		english: "European garden spider",
		swedish: "Korsspindel",
	},
	chanterelle: {
		file: "kantarell.jpg",
		english: "Chanterelle",
		swedish: "Kantarell",
	},
	rabbit: {
		file: "kanin.jpg",
		english: "Rabbit",
		swedish: "Kanin",
	},
	earthworm: {
		file: "stordaggmask.jpg",
		english: "Common earthworm",
		swedish: "Stor daggmask",
	},
	dandelion: {
		file: "maskros.jpg",
		english: "Dandelion",
		swedish: "Maskros",
	},
	moonJellyfish: {
		file: "oronmanet.jpg",
		english: "Moon jellyfish",
		swedish: "Öronmanet",
	},
	polarBear: {
		file: "isbjorn.jpg",
		english: "Polar bear",
		swedish: "Isbjörn",
	},
	perch: {
		file: "abborre.jpg",
		english: "European perch",
		swedish: "Abborre",
	},
	woodAnemone: {
		file: "vitsippa.jpg",
		english: "Wood anemone",
		swedish: "Vitsippa",
	},
	haircapMoss: {
		file: "bjornmossa.jpg",
		english: "Haircap moss",
		swedish: "Björnmossa",
	},
	brownLivingStone: {
		file: "bruntstenblad.jpg",
		english: "Brown living stone",
		swedish: "Brunt stenblad",
	},
	stickInsect: {
		file: "vandrandepinne.jpg",
		english: "Stick insect",
		swedish: "Vandrande pinne",
	},
	staphylococci: {
		file: "svinkoppor.jpg",
		english: "Staphylococci",
		swedish: "Stafylokocker",
	},
	mapLichen: {
		file: "kartlav.jpg",
		english: "Map lichen",
		swedish: "Kartlav",
	},
	rockCrystal: {
		file: "bergskristall.jpg",
		english: "Rock crystal",
		swedish: "Bergskristall",
	},
	slag: {
		file: "slagg.jpg",
		english: "Slag",
		swedish: "Slagg",
	},
	caperSpurge: {
		file: "revormstorel.jpg",
		english: "Caper spurge",
		swedish: "Revormstörel",
	},
	ladysSlipperOrchid: {
		file: "guckusko.jpg",
		english: "Lady's-slipper orchid",
		swedish: "Guckusko",
	},
	seaSquirt: {
		file: "sjopung.jpg",
		english: "Sea squirt",
		swedish: "Sjöpung",
	},
	barnacle: {
		file: "havstulpan.jpg",
		english: "Barnacle",
		swedish: "Havstulpan",
	},
	diatom: {
		file: "kiselalg.jpg",
		english: "Diatom",
		swedish: "Kiselalg",
	},
	flyOrchid: {
		file: "flugblomster.jpg",
		english: "Fly orchid",
		swedish: "Flugblomster",
	},
	greatGreenBushCricket: {
		file: "vartbitare.jpg",
		english: "Great green bush-cricket",
		swedish: "Grön vårtbitare",
	},
	scarletElfCup: {
		file: "skalsvamp.jpg",
		english: "Scarlet elf cup",
		swedish: "Vårskål",
	},
	thermusAquaticus: {
		file: "thermusaquaticus.jpg",
		english: "Thermus aquaticus",
		swedish: "Thermus aquaticus",
	},
	saguaroCactus: {
		file: "saguarokaktus.jpg",
		english: "Saguaro cactus",
		swedish: "Saguarokaktus",
	},
	chimpanzee: {
		file: "schimpans.jpg",
		english: "Chimpanzee",
		swedish: "Schimpans",
	},
	mold: {
		file: "mogel_ost_kylskap.jpg",
		english: "Mold",
		swedish: "Mögelsvamp",
	},
	lacticAcidBacterium: {
		file: "mjolksyrabakterie_yoghurt_kylskap.jpg",
		english: "Lactic acid bacterium",
		swedish: "Mjölksyrabakterie",
	},
	fossil: {
		file: "fossil.jpg",
		english: "Fossil",
		swedish: "Fossil",
	},
	linden: {
		file: "lind.jpg",
		english: "Linden tree",
		swedish: "Lind",
	},
	blackbird: {
		file: "koltrast.jpg",
		english: "Common blackbird",
		swedish: "Koltrast",
	},
	dogRose: {
		file: "nyponros.jpg",
		english: "Dog rose",
		swedish: "Nyponros",
	},
	seahorse: {
		file: "sjohast.jpg",
		english: "Seahorse",
		swedish: "Sjöhäst",
	},
	orca: {
		file: "spackhuggare.jpg",
		english: "Orca",
		swedish: "Späckhuggare",
	},
	northernPike: {
		file: "gadda.jpg",
		english: "Northern pike",
		swedish: "Gädda",
	},
	sundew: {
		file: "sileshar.jpg",
		english: "Sundew",
		swedish: "Sileshår",
	},
	hepatica: {
		file: "blasippa.jpg",
		english: "Hepatica",
		swedish: "Blåsippa",
	},
	flyAgaric: {
		file: "rodflugsvamp.jpg",
		english: "Fly agaric",
		swedish: "Röd flugsvamp",
	},
	roughRedAlga: {
		file: "rodalg.jpg",
		english: "Rough red alga",
		swedish: "Grovslick",
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
