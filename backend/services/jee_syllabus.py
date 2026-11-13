"""
JEE Main syllabus — subjects, chapters and keyword hints.

The chapter list follows the NTA JEE Main syllabus (2024 onwards), split
the way coaching institutes usually split it so that weakness analysis is
specific enough to act on (e.g. "Ray Optics" rather than just "Optics").

Every chapter name here is the canonical value stored in Question.chapter.
The keyword lists power the offline fallback tagger used when no AI key is
configured (and as a sanity check on AI output).
"""
from __future__ import annotations

import re
from typing import Optional

SUBJECTS = ["Physics", "Chemistry", "Mathematics"]

# subject -> [(chapter, [keywords...])]
SYLLABUS: dict[str, list[tuple[str, list[str]]]] = {
    "Physics": [
        ("Units and Measurements", ["dimension", "dimensional", "significant figure", "least count", "vernier", "screw gauge", "unit of", "error in", "percentage error"]),
        ("Kinematics", ["velocity", "acceleration", "projectile", "displacement", "relative velocity", "river", "rain", "uniformly accelerated", "trajectory", "range of"]),
        ("Laws of Motion", ["newton", "friction", "tension", "pulley", "inclined plane", "pseudo force", "free body", "coefficient of friction", "banking", "centripetal"]),
        ("Work, Energy and Power", ["work done", "kinetic energy", "potential energy", "power", "conservative force", "spring constant", "work-energy", "vertical circle"]),
        ("Centre of Mass and Collisions", ["centre of mass", "center of mass", "collision", "elastic", "inelastic", "coefficient of restitution", "impulse", "linear momentum"]),
        ("Rotational Motion", ["torque", "moment of inertia", "angular momentum", "rolling", "angular velocity", "radius of gyration", "rigid body", "rotational"]),
        ("Gravitation", ["gravitation", "gravitational", "satellite", "escape velocity", "orbital", "kepler", "planet", "acceleration due to gravity"]),
        ("Mechanical Properties of Solids", ["young's modulus", "youngs modulus", "stress", "strain", "bulk modulus", "shear modulus", "elastic limit", "poisson"]),
        ("Fluid Mechanics", ["viscosity", "bernoulli", "surface tension", "capillary", "buoyancy", "terminal velocity", "pascal", "stokes", "archimedes", "fluid"]),
        ("Thermal Properties of Matter", ["thermal expansion", "calorimetry", "specific heat", "latent heat", "conduction", "radiation", "stefan", "wien", "newton's law of cooling", "thermal conductivity"]),
        ("Thermodynamics", ["first law of thermodynamics", "adiabatic", "isothermal", "carnot", "heat engine", "entropy", "refrigerator", "isobaric", "isochoric", "efficiency of engine"]),
        ("Kinetic Theory of Gases", ["kinetic theory", "rms speed", "mean free path", "degrees of freedom", "equipartition", "ideal gas", "root mean square"]),
        ("Oscillations", ["simple harmonic", "shm", "oscillation", "time period of pendulum", "spring-mass", "amplitude", "damped"]),
        ("Waves and Sound", ["wave", "sound", "doppler", "beats", "standing wave", "resonance", "organ pipe", "string vibrat", "frequency of"]),
        ("Electrostatics", ["electric field", "electric potential", "coulomb", "gauss", "charge", "dipole", "equipotential", "electric flux"]),
        ("Capacitors", ["capacitor", "capacitance", "dielectric", "parallel plate"]),
        ("Current Electricity", ["resistance", "resistor", "ohm", "kirchhoff", "wheatstone", "potentiometer", "meter bridge", "emf", "internal resistance", "drift velocity", "current"]),
        ("Magnetic Effects of Current", ["magnetic field", "biot", "ampere", "solenoid", "lorentz force", "cyclotron", "galvanometer", "toroid"]),
        ("Magnetism and Matter", ["bar magnet", "magnetic moment", "diamagnetic", "paramagnetic", "ferromagnetic", "susceptibility", "hysteresis", "earth's magnetic"]),
        ("Electromagnetic Induction", ["faraday", "lenz", "induced emf", "self inductance", "mutual inductance", "eddy current", "motional emf", "magnetic flux"]),
        ("Alternating Current", ["alternating current", "lcr", "impedance", "reactance", "resonant frequency", "power factor", "transformer", "rms value", "ac circuit"]),
        ("Electromagnetic Waves", ["electromagnetic wave", "displacement current", "em wave", "electromagnetic spectrum"]),
        ("Ray Optics", ["lens", "mirror", "refraction", "refractive index", "prism", "total internal reflection", "focal length", "telescope", "microscope", "magnification"]),
        ("Wave Optics", ["interference", "diffraction", "young's double slit", "ydse", "fringe", "polarisation", "polarization", "huygens", "brewster", "malus"]),
        ("Dual Nature of Matter and Radiation", ["photoelectric", "work function", "de broglie", "stopping potential", "threshold frequency", "photon"]),
        ("Atoms", ["bohr", "hydrogen atom", "spectral series", "rydberg", "rutherford", "lyman", "balmer", "energy level"]),
        ("Nuclei", ["nucleus", "nuclear", "radioactive", "half life", "half-life", "binding energy", "mass defect", "fission", "fusion", "decay constant"]),
        ("Semiconductors and Electronic Devices", ["semiconductor", "diode", "p-n junction", "pn junction", "transistor", "logic gate", "zener", "rectifier", "nand", "nor gate"]),
        ("Experimental Skills", ["experiment", "least count of", "measured using", "vernier calipers", "spherometer"]),
    ],
    "Chemistry": [
        ("Some Basic Concepts of Chemistry", ["mole", "molar mass", "stoichiometry", "limiting reagent", "empirical formula", "molarity", "molality", "avogadro", "percentage composition"]),
        ("Atomic Structure", ["quantum number", "orbital", "electronic configuration", "aufbau", "hund", "pauli", "heisenberg", "de broglie wavelength", "bohr model", "nodes"]),
        ("Chemical Bonding and Molecular Structure", ["hybridisation", "hybridization", "vsepr", "bond order", "molecular orbital", "dipole moment", "bond angle", "hydrogen bond", "lone pair", "shape of"]),
        ("Chemical Thermodynamics", ["enthalpy", "entropy", "gibbs", "hess", "bond enthalpy", "spontaneous", "internal energy", "heat of"]),
        ("Solutions", ["raoult", "colligative", "osmotic pressure", "elevation in boiling", "depression in freezing", "van't hoff", "vant hoff", "henry's law", "vapour pressure"]),
        ("Chemical Equilibrium", ["equilibrium constant", "le chatelier", "kp", "kc", "reaction quotient", "degree of dissociation"]),
        ("Ionic Equilibrium", ["ph", "buffer", "solubility product", "ksp", "hydrolysis", "common ion", "acid dissociation", "pka", "indicator"]),
        ("Redox Reactions", ["oxidation number", "oxidation state", "redox", "balancing", "disproportionation", "n-factor", "equivalent weight"]),
        ("Electrochemistry", ["electrode potential", "nernst", "galvanic", "electrolysis", "faraday's law", "conductance", "conductivity", "kohlrausch", "emf of cell", "cell potential"]),
        ("Chemical Kinetics", ["rate constant", "order of reaction", "half life", "half-life", "arrhenius", "activation energy", "rate law", "first order", "zero order", "molecularity", "rate of reaction", "plot of rate", "catalyst", "rate law", "integrated rate", "rate of disappearance", "pseudo first"]),
        ("Classification of Elements and Periodicity", ["periodic", "ionisation enthalpy", "ionization energy", "electron gain", "electronegativity", "atomic radius", "ionic radius", "periodicity"]),
        ("p-Block Elements", ["p-block", "nitrogen family", "oxygen family", "halogen", "noble gas", "boron", "carbon family", "interhalogen", "oxoacid", "xenon", "ozone"]),
        ("d- and f-Block Elements", ["d-block", "f-block", "transition metal", "lanthanoid", "actinoid", "lanthanide", "kmno4", "k2cr2o7", "dichromate", "permanganate"]),
        ("Coordination Compounds", ["coordination", "ligand", "crystal field", "werner", "chelate", "complex", "isomerism in complexes", "denticity", "cfse", "iupac name of complex"]),
        ("Purification and Characterisation of Organic Compounds", ["chromatography", "distillation", "crystallisation", "lassaigne", "kjeldahl", "dumas", "carius", "estimation of"]),
        ("General Organic Chemistry", ["inductive effect", "resonance", "hyperconjugation", "carbocation", "carbanion", "free radical", "nucleophile", "electrophile", "iupac name", "isomerism", "stereoisomer", "acidity order", "basicity order", "goc", "reactive species", "reaction intermediate", "e or z", "e/z", "r or s", "chirality", "optical isomer", "nucleophilicity", "stability of", "tautomer", "mesomeric"]),
        ("Hydrocarbons", ["alkane", "alkene", "alkyne", "benzene", "aromatic", "markovnikov", "ozonolysis", "friedel", "wurtz", "conformation"]),
        ("Haloalkanes and Haloarenes", ["haloalkane", "haloarene", "alkyl halide", "sn1", "sn2", "aryl halide", "elimination", "e1", "e2", "grignard"]),
        ("Alcohols, Phenols and Ethers", ["alcohol", "phenol", "ether", "lucas", "williamson", "reimer", "kolbe", "dehydration of"]),
        ("Aldehydes, Ketones and Carboxylic Acids", ["aldehyde", "ketone", "carboxylic", "aldol", "cannizzaro", "tollens", "fehling", "hvz", "carbonyl", "ester", "clemmensen", "wolff"]),
        ("Amines and Nitrogen Compounds", ["amine", "diazonium", "hoffmann", "hofmann", "gabriel", "aniline", "nitro", "coupling reaction", "carbylamine", "hinsberg"]),
        ("Biomolecules", ["carbohydrate", "glucose", "protein", "amino acid", "vitamin", "nucleic acid", "dna", "rna", "enzyme", "peptide"]),
        ("Principles of Practical Chemistry", ["salt analysis", "titration", "detection of", "functional group test", "preparation of", "qualitative analysis"]),
    ],
    "Mathematics": [
        ("Sets, Relations and Functions", ["set", "relation", "function", "domain", "range of the function", "one-one", "onto", "bijective", "equivalence relation", "composite function"]),
        ("Complex Numbers", ["complex number", "argand", "modulus", "argument", "iota", "conjugate", "cube root of unity", "de moivre"]),
        ("Quadratic Equations", ["quadratic", "roots", "discriminant", "sum of roots", "product of roots", "nature of roots"]),
        ("Matrices and Determinants", ["matrix", "matrices", "determinant", "adjoint", "inverse of", "singular", "cramer", "transpose", "symmetric matrix"]),
        ("Permutations and Combinations", ["permutation", "combination", "arrangement", "ways", "selected", "committee", "distribution of"]),
        ("Binomial Theorem", ["binomial", "coefficient of", "expansion", "general term", "middle term"]),
        ("Sequences and Series", ["arithmetic progression", "geometric progression", "a.p.", "g.p.", "harmonic", "sum of the series", "sum of n terms", "a.m.", "g.m."]),
        ("Limits, Continuity and Differentiability", ["limit", "continuity", "continuous", "differentiable", "differentiability", "l'hospital", "lim"]),
        ("Differentiation", ["derivative", "differentiate", "dy/dx", "chain rule", "implicit differentiation", "parametric"]),
        ("Application of Derivatives", ["maxima", "minima", "tangent", "normal", "increasing", "decreasing", "rate of change", "monotonic", "rolle", "mean value theorem"]),
        ("Indefinite Integration", ["indefinite integral", "integrate", "antiderivative", "integration by parts", "∫ "]),
        ("Definite Integration", ["definite integral", "∫_", "limits of integration", "properties of definite", "leibniz"]),
        ("Area Under Curves", ["area bounded", "area enclosed", "area under", "area of the region"]),
        ("Differential Equations", ["differential equation", "order and degree", "integrating factor", "variable separable", "homogeneous differential"]),
        ("Straight Lines", ["straight line", "slope", "intercept", "angle between lines", "distance of point from line", "concurrent", "collinear"]),
        ("Circles", ["circle", "radius", "chord", "tangent to the circle", "family of circles", "orthogonal"]),
        ("Conic Sections", ["parabola", "ellipse", "hyperbola", "eccentricity", "focus", "directrix", "latus rectum", "conic"]),
        ("Three Dimensional Geometry", ["direction cosine", "direction ratio", "plane", "skew lines", "3d", "line in space", "shortest distance between"]),
        ("Vector Algebra", ["vector", "dot product", "cross product", "scalar triple", "unit vector", "projection of"]),
        ("Statistics", ["mean", "median", "mode", "variance", "standard deviation", "mean deviation"]),
        ("Probability", ["probability", "bayes", "random variable", "binomial distribution", "independent events", "conditional probability", "die", "dice", "coin"]),
        ("Trigonometry", ["sin", "cos", "tan", "trigonometric", "inverse trigonometric", "height and distance", "sin⁻¹", "tan⁻¹", "general solution"]),
    ],
}

# Extra phrases seen in JEE papers (multi-word phrases score double)
_EXTRA_KEYWORDS: dict[str, dict[str, list[str]]] = {
    "Physics": {
        "Ray Optics": ["ray of light", "equilateral prism", "angle of deviation", "minimum deviation", "biconvex", "concave", "convex", "compound microscope"],
        "Mechanical Properties of Solids": ["modulus of rigidity", "rigidity", "breaking stress", "elongation", "steel wire"],
        "Gravitation": ["earth's surface", "below the earth", "above the earth", "radius of the earth", "change in g"],
        "Semiconductors and Electronic Devices": ["logic circuit", "input combination", "and gate", "or gate", "not gate"],
        "Alternating Current": ["a.c. source", "ac source", "angular frequency"],
        "Electromagnetic Induction": ["inductance", "inductor"],
        "Current Electricity": ["terminals", "battery", "potential difference across"],
        "Experimental Skills": ["zero error", "vernier scale", "main scale"],
        "Kinematics": ["dropped from", "above the ground", "thrown up", "thrown vertically", "free fall", "freely falling"],
    },
    "Chemistry": {
        "Ionic Equilibrium": ["sparingly soluble", "solubility", "ph of", "acidic medium"],
        "Chemical Bonding and Molecular Structure": ["hybridized", "hybridised", "sp³d", "sp3d", "sp³", "lone pair"],
        "Amines and Nitrogen Compounds": ["isocyanide", "cyanide", "aromatic amine", "nh₂"],
        "Alcohols, Phenols and Ethers": ["pcc", "nitrophenol", "o-nitrophenol", "p-nitrophenol", "dehydration"],
        "Principles of Practical Chemistry": ["primary standard", "titrimetric", "phenolphthalein"],
        "Coordination Compounds": ["metal carbonyl", "carbonyls", "eg orbital", "t2g"],
        "Chemical Equilibrium": ["pressure equilibrium constant"],
    },
    "Mathematics": {
        "Matrices and Determinants": ["system of linear equations", "infinitely many solutions", "consistent", "adj("],
        "Straight Lines": ["orthocentre", "orthocenter", "centroid", "equilateral triangle", "vertex p"],
        "Three Dimensional Geometry": ["distance of the point", "point of intersection of the lines", "lines r", "from the line"],
        "Definite Integration": ["value of the integral", "∫0", "∫π"],
        "Sequences and Series": ["∑", "sum of the first", "terms of an a.p."],
    },
}
for _subj, _chs in _EXTRA_KEYWORDS.items():
    for _i, (_ch, _kws) in enumerate(SYLLABUS[_subj]):
        if _chs.get(_ch):
            SYLLABUS[_subj][_i] = (_ch, _kws + [k for k in _chs[_ch] if k not in _kws])

# Words that appear in many chapters count half, so one generic hit can't outvote the topic
_GENERIC = {"mole", "set", "function", "relation", "power", "wave", "charge", "complex", "ways", "selected", "mean",
            "velocity", "displacement", "radius", "roots", "focus", "plane", "resonance", "elastic", "emf",
            "balancing", "periodic", "indicator", "ph", "orbital", "increasing", "decreasing", "tangent", "normal"}

_ALL_CHAPTERS: dict[str, str] = {
    ch.lower(): subj for subj, items in SYLLABUS.items() for ch, _ in items
}
_CANONICAL: dict[str, str] = {ch.lower(): ch for items in SYLLABUS.values() for ch, _ in items}


def syllabus_payload() -> list[dict]:
    """JSON-friendly syllabus for the frontend dropdowns."""
    return [
        {"subject": subj, "chapters": [ch for ch, _ in items]}
        for subj, items in SYLLABUS.items()
    ]


def canonical_chapter(name: Optional[str]) -> Optional[str]:
    """Return the canonical spelling of a chapter name, or None if unknown."""
    if not name:
        return None
    return _CANONICAL.get(str(name).strip().lower())


def subject_of_chapter(chapter: Optional[str]) -> Optional[str]:
    if not chapter:
        return None
    return _ALL_CHAPTERS.get(str(chapter).strip().lower())


_SUBJECT_PATTERNS = [
    ("Physics", re.compile(r"\bphy(s|sics)?\b", re.IGNORECASE)),
    ("Chemistry", re.compile(r"\bchem(istry)?\b", re.IGNORECASE)),
    ("Mathematics", re.compile(r"\bmath(s|ematics)?\b", re.IGNORECASE)),
]


def normalize_subject(value: Optional[str]) -> Optional[str]:
    """Map 'phy', 'PHYSICS', 'Maths' etc. to a canonical subject name."""
    if not value:
        return None
    v = str(value).strip()
    for subj in SUBJECTS:
        if v.lower() == subj.lower():
            return subj
    for subj, pat in _SUBJECT_PATTERNS:
        if pat.search(v):
            return subj
    return None


def infer_subject(*hints: Optional[str]) -> Optional[str]:
    """First canonical subject recognisable in any of the hints (subject, section name...)."""
    for h in hints:
        s = normalize_subject(h)
        if s:
            return s
    return None


def keyword_suggest(text: str, subject: Optional[str] = None) -> Optional[tuple[str, str, float]]:
    """
    Offline chapter guess from keywords.
    Returns (subject, chapter, confidence 0-1) or None when nothing matches.
    """
    blob = f" {(text or '').lower()} "
    if len(blob.strip()) < 3:
        return None
    subjects = [subject] if subject in SYLLABUS else SUBJECTS
    best: tuple[float, str, str] | None = None
    second = 0
    for subj in subjects:
        for chapter, kws in SYLLABUS[subj]:
            score = 0.0
            for kw in kws:
                kw_l = kw.lower()
                w = 0.5 if kw_l in _GENERIC else 1.0
                # whole-word-ish match for short keywords to avoid 'sin' in 'using'
                if len(kw_l) <= 4:
                    if re.search(rf"(?<![a-z]){re.escape(kw_l)}(?![a-z])", blob):
                        score += w
                elif kw_l in blob:
                    score += (2 if " " in kw_l else 1) * w
            if score and (best is None or score > best[0]):
                second = best[0] if best else 0
                best = (score, subj, chapter)
            elif score and score > second:
                second = score
    if not best:
        return None
    score, subj, chapter = best
    margin = score - second
    confidence = min(0.85, 0.35 + 0.1 * score + 0.1 * margin)
    return subj, chapter, round(confidence, 2)
