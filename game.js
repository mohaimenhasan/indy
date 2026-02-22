// ============================================================
// SPIN CLASH — Open World Spinning Top RPG
// A cute, Pokemon-inspired open world game with spinning top battles
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ── Resize ──────────────────────────────────────────────────
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ── Constants ───────────────────────────────────────────────
const TILE = 48;
const MOVE_SPEED = 3;
const ENCOUNTER_CHANCE = 0.08;
const MAX_TEAM_SIZE = 6;
const MAX_LEVEL = 50;

// ── Sound System (Web Audio) ────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function ensureAudio() {
    if (!audioCtx) audioCtx = new AudioCtx();
}
function playTone(freq, dur, type = 'square', vol = 0.08) {
    try {
        ensureAudio();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.value = vol;
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start();
        o.stop(audioCtx.currentTime + dur);
    } catch (e) {}
}
function sfx(name) {
    switch (name) {
        case 'step': playTone(200, 0.05, 'sine', 0.03); break;
        case 'bump': playTone(100, 0.1, 'square', 0.05); break;
        case 'talk': playTone(400 + Math.random() * 200, 0.06, 'square', 0.04); break;
        case 'select': playTone(600, 0.08, 'sine', 0.06); break;
        case 'confirm': playTone(500, 0.08, 'sine', 0.06); setTimeout(() => playTone(700, 0.1, 'sine', 0.06), 80); break;
        case 'cancel': playTone(300, 0.1, 'square', 0.05); break;
        case 'hit': playTone(150, 0.15, 'sawtooth', 0.06); break;
        case 'crit': playTone(800, 0.05, 'square', 0.06); setTimeout(() => playTone(400, 0.2, 'sawtooth', 0.06), 50); break;
        case 'heal': playTone(400, 0.1, 'sine', 0.05); setTimeout(() => playTone(500, 0.1, 'sine', 0.05), 100); setTimeout(() => playTone(650, 0.15, 'sine', 0.05), 200); break;
        case 'levelup': [0,100,200,300].forEach((d, i) => setTimeout(() => playTone(400 + i * 100, 0.15, 'sine', 0.06), d)); break;
        case 'catch': [0,80,160,240,320].forEach((d, i) => setTimeout(() => playTone(300 + i * 80, 0.1, 'sine', 0.06), d)); break;
        case 'encounter': playTone(300, 0.1, 'square', 0.06); setTimeout(() => playTone(450, 0.1, 'square', 0.06), 100); setTimeout(() => playTone(600, 0.2, 'square', 0.06), 200); break;
        case 'win': [0,120,240,360,480].forEach((d, i) => setTimeout(() => playTone(400 + i * 60, 0.2, 'sine', 0.07), d)); break;
        case 'lose': [0,150,300].forEach((d, i) => setTimeout(() => playTone(400 - i * 80, 0.25, 'sine', 0.06), d)); break;
        case 'menu': playTone(520, 0.06, 'sine', 0.05); break;
        case 'evolve': for (let i = 0; i < 8; i++) setTimeout(() => playTone(300 + i * 60, 0.12, 'sine', 0.07), i * 100); break;
        case 'buy': playTone(600, 0.06, 'sine', 0.05); setTimeout(() => playTone(800, 0.12, 'sine', 0.05), 80); break;
    }
}

// ── Types & Effectiveness ───────────────────────────────────
const TYPES = ['fire','ice','nature','electric','water','dark','light','earth','wind','star'];
const TYPE_COLORS = {
    fire: '#ff6644', ice: '#66ccff', nature: '#66dd66', electric: '#ffdd44',
    water: '#4488ff', dark: '#9966cc', light: '#ffeeaa', earth: '#cc9966',
    wind: '#aaddcc', star: '#ff88dd'
};
const TYPE_EMOJI = {
    fire: '🔥', ice: '❄️', nature: '🌿', electric: '⚡', water: '💧',
    dark: '🌙', light: '☀️', earth: '🪨', wind: '🌬️', star: '⭐'
};
// type advantage: key beats values in array
const TYPE_CHART = {
    fire: ['nature','ice','wind'], ice: ['water','wind','nature'], nature: ['water','earth','electric'],
    electric: ['water','wind','ice'], water: ['fire','earth','dark'], dark: ['light','star','nature'],
    light: ['dark','fire','earth'], earth: ['fire','electric','star'], wind: ['nature','earth','light'],
    star: ['dark','ice','water']
};
function typeMultiplier(atkType, defType) {
    if (TYPE_CHART[atkType] && TYPE_CHART[atkType].includes(defType)) return 1.5;
    if (TYPE_CHART[defType] && TYPE_CHART[defType].includes(atkType)) return 0.6;
    return 1.0;
}

// ── Moves Database ──────────────────────────────────────────
const MOVES_DB = {
    // Basic moves (learned early)
    spin_attack: { name: 'Spin Attack', type: 'star', power: 30, acc: 95, pp: 30, desc: 'A basic spinning strike.', lvl: 1 },
    tackle: { name: 'Tackle', type: 'earth', power: 25, acc: 100, pp: 35, desc: 'A quick body slam.', lvl: 1 },
    defend: { name: 'Defend', type: 'earth', power: 0, acc: 100, pp: 20, desc: 'Raises defense for this turn.', lvl: 1, effect: 'def_up' },
    // Type moves
    flame_spin: { name: 'Flame Spin', type: 'fire', power: 45, acc: 90, pp: 20, desc: 'Spins engulfed in flames.', lvl: 5 },
    fire_burst: { name: 'Fire Burst', type: 'fire', power: 70, acc: 85, pp: 10, desc: 'Explosive fire attack!', lvl: 15 },
    inferno_rush: { name: 'Inferno Rush', type: 'fire', power: 95, acc: 75, pp: 5, desc: 'Ultimate fire technique.', lvl: 30 },
    ice_shard: { name: 'Ice Shard', type: 'ice', power: 40, acc: 95, pp: 25, desc: 'Launches sharp ice.', lvl: 5 },
    blizzard_spin: { name: 'Blizzard Spin', type: 'ice', power: 65, acc: 85, pp: 12, desc: 'A freezing vortex.', lvl: 15 },
    absolute_zero: { name: 'Absolute Zero', type: 'ice', power: 90, acc: 75, pp: 5, desc: 'Freezes everything solid.', lvl: 30 },
    vine_whip: { name: 'Vine Whip', type: 'nature', power: 40, acc: 95, pp: 25, desc: 'Strikes with thorny vines.', lvl: 5 },
    petal_storm: { name: 'Petal Storm', type: 'nature', power: 65, acc: 88, pp: 12, desc: 'A storm of sharp petals.', lvl: 15 },
    bloom_cannon: { name: 'Bloom Cannon', type: 'nature', power: 90, acc: 78, pp: 5, desc: 'Massive nature energy blast.', lvl: 30 },
    spark: { name: 'Spark', type: 'electric', power: 40, acc: 95, pp: 25, desc: 'A quick electric jolt.', lvl: 5 },
    thunder_spin: { name: 'Thunder Spin', type: 'electric', power: 65, acc: 85, pp: 12, desc: 'Spins with lightning.', lvl: 15 },
    storm_surge: { name: 'Storm Surge', type: 'electric', power: 95, acc: 72, pp: 5, desc: 'Calls down a massive storm.', lvl: 30 },
    water_jet: { name: 'Water Jet', type: 'water', power: 40, acc: 95, pp: 25, desc: 'Shoots a jet of water.', lvl: 5 },
    tidal_spin: { name: 'Tidal Spin', type: 'water', power: 65, acc: 88, pp: 12, desc: 'Spins surrounded by water.', lvl: 15 },
    tsunami_crash: { name: 'Tsunami Crash', type: 'water', power: 90, acc: 76, pp: 5, desc: 'A massive wave attack.', lvl: 30 },
    shadow_strike: { name: 'Shadow Strike', type: 'dark', power: 42, acc: 92, pp: 22, desc: 'Strikes from the shadows.', lvl: 5 },
    dark_vortex: { name: 'Dark Vortex', type: 'dark', power: 68, acc: 85, pp: 10, desc: 'A vortex of darkness.', lvl: 15 },
    void_collapse: { name: 'Void Collapse', type: 'dark', power: 92, acc: 74, pp: 5, desc: 'Collapses space around the foe.', lvl: 30 },
    light_beam: { name: 'Light Beam', type: 'light', power: 42, acc: 93, pp: 22, desc: 'A beam of pure light.', lvl: 5 },
    radiant_spin: { name: 'Radiant Spin', type: 'light', power: 65, acc: 87, pp: 12, desc: 'Spins radiating light.', lvl: 15 },
    solar_flare: { name: 'Solar Flare', type: 'light', power: 90, acc: 76, pp: 5, desc: 'Blinding solar explosion.', lvl: 30 },
    rock_throw: { name: 'Rock Throw', type: 'earth', power: 40, acc: 90, pp: 25, desc: 'Hurls rocks at the foe.', lvl: 5 },
    earthquake_spin: { name: 'Earthquake Spin', type: 'earth', power: 68, acc: 85, pp: 10, desc: 'Shakes the ground violently.', lvl: 15 },
    tectonic_crush: { name: 'Tectonic Crush', type: 'earth', power: 92, acc: 75, pp: 5, desc: 'Crushes with tectonic force.', lvl: 30 },
    gust: { name: 'Gust', type: 'wind', power: 38, acc: 95, pp: 25, desc: 'A gust of wind.', lvl: 5 },
    cyclone_spin: { name: 'Cyclone Spin', type: 'wind', power: 62, acc: 88, pp: 12, desc: 'Spins like a cyclone.', lvl: 15 },
    hurricane_fury: { name: 'Hurricane Fury', type: 'wind', power: 88, acc: 78, pp: 5, desc: 'A devastating hurricane.', lvl: 30 },
    twinkle: { name: 'Twinkle', type: 'star', power: 42, acc: 95, pp: 22, desc: 'Sparkling star energy.', lvl: 5 },
    nova_spin: { name: 'Nova Spin', type: 'star', power: 68, acc: 85, pp: 10, desc: 'Spins with nova power.', lvl: 15 },
    supernova: { name: 'Supernova', type: 'star', power: 95, acc: 70, pp: 5, desc: 'The ultimate star explosion!', lvl: 30 },
    // Healing move
    rest: { name: 'Rest', type: 'light', power: 0, acc: 100, pp: 10, desc: 'Restores some HP.', lvl: 8, effect: 'heal_30' },
    mega_rest: { name: 'Mega Rest', type: 'light', power: 0, acc: 100, pp: 5, desc: 'Restores lots of HP.', lvl: 22, effect: 'heal_60' },
    // Status moves
    speed_boost: { name: 'Speed Boost', type: 'wind', power: 0, acc: 100, pp: 15, desc: 'Greatly increases speed.', lvl: 10, effect: 'spd_up' },
    power_up: { name: 'Power Up', type: 'fire', power: 0, acc: 100, pp: 15, desc: 'Greatly increases attack.', lvl: 10, effect: 'atk_up' },
};

// ── Spinning Top Species Database ───────────────────────────
const SPECIES = [
    // Starter line
    { id: 0, name: 'Blaze', type: 'fire', emoji: '🔥', baseHp: 42, baseAtk: 55, baseDef: 38, baseSpd: 48,
      desc: 'A feisty little flame top. Always fired up!',
      moves: ['spin_attack','tackle','flame_spin','power_up','fire_burst','inferno_rush'],
      evolveLevel: 16, evolveTo: 1, color: '#ff6644', rarity: 'starter' },
    { id: 1, name: 'Blazeor', type: 'fire', emoji: '🌋', baseHp: 58, baseAtk: 75, baseDef: 52, baseSpd: 62,
      desc: 'An evolved flame top. Its spin creates walls of fire!',
      moves: ['spin_attack','flame_spin','power_up','fire_burst','inferno_rush','speed_boost'],
      evolveLevel: 36, evolveTo: 2, color: '#ff4422', rarity: 'rare' },
    { id: 2, name: 'Infernotop', type: 'fire', emoji: '☄️', baseHp: 72, baseAtk: 95, baseDef: 65, baseSpd: 78,
      desc: 'The ultimate fire top. Legends say it can melt mountains.',
      moves: ['flame_spin','fire_burst','inferno_rush','power_up','speed_boost','supernova'],
      color: '#ff2200', rarity: 'legendary' },

    { id: 3, name: 'Frost', type: 'ice', emoji: '❄️', baseHp: 45, baseAtk: 38, baseDef: 55, baseSpd: 42,
      desc: 'A cool and collected ice top. Chills everything it touches.',
      moves: ['spin_attack','tackle','ice_shard','defend','blizzard_spin','absolute_zero'],
      evolveLevel: 16, evolveTo: 4, color: '#66ccff', rarity: 'starter' },
    { id: 4, name: 'Frostara', type: 'ice', emoji: '🧊', baseHp: 62, baseAtk: 52, baseDef: 75, baseSpd: 55,
      desc: 'An evolved ice top. Creates beautiful ice crystals as it spins.',
      moves: ['spin_attack','ice_shard','defend','blizzard_spin','absolute_zero','rest'],
      evolveLevel: 36, evolveTo: 5, color: '#44aaff', rarity: 'rare' },
    { id: 5, name: 'Glaciatop', type: 'ice', emoji: '💎', baseHp: 78, baseAtk: 65, baseDef: 95, baseSpd: 68,
      desc: 'The ultimate ice top. Its body is harder than diamond.',
      moves: ['ice_shard','blizzard_spin','absolute_zero','defend','rest','mega_rest'],
      color: '#2288ff', rarity: 'legendary' },

    { id: 6, name: 'Petal', type: 'nature', emoji: '🌸', baseHp: 50, baseAtk: 42, baseDef: 42, baseSpd: 45,
      desc: 'A gentle flower top. Spreads petals wherever it goes.',
      moves: ['spin_attack','tackle','vine_whip','rest','petal_storm','bloom_cannon'],
      evolveLevel: 16, evolveTo: 7, color: '#ff88aa', rarity: 'starter' },
    { id: 7, name: 'Floratop', type: 'nature', emoji: '🌺', baseHp: 68, baseAtk: 58, baseDef: 58, baseSpd: 60,
      desc: 'An evolved nature top. A garden blooms in its wake.',
      moves: ['vine_whip','rest','petal_storm','bloom_cannon','speed_boost','mega_rest'],
      evolveLevel: 36, evolveTo: 8, color: '#ff66aa', rarity: 'rare' },
    { id: 8, name: 'Bloomtitan', type: 'nature', emoji: '🌳', baseHp: 90, baseAtk: 72, baseDef: 72, baseSpd: 72,
      desc: 'The ultimate nature top. It is one with the forest.',
      moves: ['petal_storm','bloom_cannon','rest','mega_rest','speed_boost','supernova'],
      color: '#44aa44', rarity: 'legendary' },

    // Wild species
    { id: 9, name: 'Sparky', type: 'electric', emoji: '⚡', baseHp: 38, baseAtk: 48, baseDef: 35, baseSpd: 58,
      desc: 'A zippy electric top. Too fast to catch... usually!',
      moves: ['spin_attack','spark','speed_boost','thunder_spin','storm_surge'],
      evolveLevel: 18, evolveTo: 10, color: '#ffdd44', rarity: 'common' },
    { id: 10, name: 'Voltatop', type: 'electric', emoji: '🔌', baseHp: 55, baseAtk: 68, baseDef: 48, baseSpd: 82,
      desc: 'An evolved electric top. It moves at lightning speed!',
      moves: ['spark','speed_boost','thunder_spin','storm_surge','power_up'],
      color: '#ddaa00', rarity: 'rare' },

    { id: 11, name: 'Droplet', type: 'water', emoji: '💧', baseHp: 48, baseAtk: 42, baseDef: 48, baseSpd: 42,
      desc: 'A cute water top. Leaves little puddles behind.',
      moves: ['spin_attack','water_jet','defend','tidal_spin','tsunami_crash'],
      evolveLevel: 18, evolveTo: 12, color: '#4488ff', rarity: 'common' },
    { id: 12, name: 'Tidalon', type: 'water', emoji: '🌊', baseHp: 68, baseAtk: 62, baseDef: 68, baseSpd: 58,
      desc: 'An evolved water top. Commands the tides!',
      moves: ['water_jet','tidal_spin','tsunami_crash','defend','rest'],
      color: '#2266dd', rarity: 'rare' },

    { id: 13, name: 'Shady', type: 'dark', emoji: '🌙', baseHp: 40, baseAtk: 52, baseDef: 38, baseSpd: 50,
      desc: 'A mysterious dark top. It lurks in the shadows.',
      moves: ['spin_attack','shadow_strike','speed_boost','dark_vortex','void_collapse'],
      evolveLevel: 20, evolveTo: 14, color: '#9966cc', rarity: 'uncommon' },
    { id: 14, name: 'Eclipsor', type: 'dark', emoji: '🕳️', baseHp: 58, baseAtk: 78, baseDef: 52, baseSpd: 70,
      desc: 'An evolved dark top. It can bend shadows to its will.',
      moves: ['shadow_strike','dark_vortex','void_collapse','speed_boost','power_up'],
      color: '#6633aa', rarity: 'rare' },

    { id: 15, name: 'Sunny', type: 'light', emoji: '☀️', baseHp: 48, baseAtk: 40, baseDef: 45, baseSpd: 45,
      desc: 'A cheerful light top. Brightens everyone\'s day!',
      moves: ['spin_attack','light_beam','rest','radiant_spin','solar_flare','mega_rest'],
      evolveLevel: 18, evolveTo: 16, color: '#ffeeaa', rarity: 'uncommon' },
    { id: 16, name: 'Radiantop', type: 'light', emoji: '✨', baseHp: 68, baseAtk: 58, baseDef: 65, baseSpd: 62,
      desc: 'An evolved light top. Its radiance heals allies.',
      moves: ['light_beam','radiant_spin','solar_flare','rest','mega_rest','defend'],
      color: '#ffdd66', rarity: 'rare' },

    { id: 17, name: 'Pebble', type: 'earth', emoji: '🪨', baseHp: 55, baseAtk: 45, baseDef: 58, baseSpd: 28,
      desc: 'A sturdy earth top. Slow but unbreakable!',
      moves: ['spin_attack','rock_throw','defend','earthquake_spin','tectonic_crush'],
      evolveLevel: 20, evolveTo: 18, color: '#cc9966', rarity: 'common' },
    { id: 18, name: 'Boulderon', type: 'earth', emoji: '⛰️', baseHp: 80, baseAtk: 65, baseDef: 85, baseSpd: 38,
      desc: 'An evolved earth top. It IS the mountain.',
      moves: ['rock_throw','earthquake_spin','tectonic_crush','defend','power_up'],
      color: '#997744', rarity: 'rare' },

    { id: 19, name: 'Breeze', type: 'wind', emoji: '🍃', baseHp: 40, baseAtk: 38, baseDef: 35, baseSpd: 60,
      desc: 'A light and nimble wind top. Hard to pin down!',
      moves: ['spin_attack','gust','speed_boost','cyclone_spin','hurricane_fury'],
      evolveLevel: 18, evolveTo: 20, color: '#88ddbb', rarity: 'common' },
    { id: 20, name: 'Galeforce', type: 'wind', emoji: '🌪️', baseHp: 58, baseAtk: 55, baseDef: 48, baseSpd: 88,
      desc: 'An evolved wind top. It IS the storm!',
      moves: ['gust','cyclone_spin','hurricane_fury','speed_boost','power_up'],
      color: '#55bb88', rarity: 'rare' },

    { id: 21, name: 'Twinkle', type: 'star', emoji: '⭐', baseHp: 44, baseAtk: 44, baseDef: 44, baseSpd: 50,
      desc: 'A magical star top. Wishes come true near it!',
      moves: ['spin_attack','twinkle','rest','nova_spin','supernova','mega_rest'],
      evolveLevel: 22, evolveTo: 22, color: '#ff88dd', rarity: 'rare' },
    { id: 22, name: 'Cosmotop', type: 'star', emoji: '🌟', baseHp: 70, baseAtk: 70, baseDef: 70, baseSpd: 70,
      desc: 'An evolved star top. Contains the power of a galaxy!',
      moves: ['twinkle','nova_spin','supernova','mega_rest','speed_boost','power_up'],
      color: '#dd66bb', rarity: 'legendary' },
];

// ── Create a top instance ───────────────────────────────────
function createTop(speciesId, level) {
    const sp = SPECIES[speciesId];
    level = Math.min(level, MAX_LEVEL);
    const statMult = 1 + (level - 1) * 0.08;
    const hp = Math.floor(sp.baseHp * statMult);
    const moves = sp.moves.filter(m => MOVES_DB[m].lvl <= level).slice(-4);
    if (moves.length === 0) moves.push('spin_attack');
    const movePP = {};
    moves.forEach(m => movePP[m] = MOVES_DB[m].pp);
    return {
        speciesId, species: sp, name: sp.name, level, xp: 0,
        maxHp: hp, hp, atk: Math.floor(sp.baseAtk * statMult),
        def: Math.floor(sp.baseDef * statMult), spd: Math.floor(sp.baseSpd * statMult),
        moves, movePP, type: sp.type, caught: true
    };
}
function xpToNext(level) { return Math.floor(20 * Math.pow(level, 1.5)); }
function addXP(top, amount) {
    const messages = [];
    top.xp += amount;
    while (top.xp >= xpToNext(top.level) && top.level < MAX_LEVEL) {
        top.xp -= xpToNext(top.level);
        top.level++;
        const sp = top.species;
        const m = 1 + (top.level - 1) * 0.08;
        top.maxHp = Math.floor(sp.baseHp * m);
        top.hp = Math.min(top.hp + 5, top.maxHp);
        top.atk = Math.floor(sp.baseAtk * m);
        top.def = Math.floor(sp.baseDef * m);
        top.spd = Math.floor(sp.baseSpd * m);
        // Learn new moves
        const newMoves = sp.moves.filter(mv => MOVES_DB[mv].lvl === top.level);
        newMoves.forEach(mv => {
            if (top.moves.length < 4) {
                top.moves.push(mv);
                top.movePP[mv] = MOVES_DB[mv].pp;
                messages.push(`${top.name} learned ${MOVES_DB[mv].name}!`);
            } else {
                // Replace weakest move
                let weakest = 0;
                for (let i = 1; i < top.moves.length; i++) {
                    if (MOVES_DB[top.moves[i]].power < MOVES_DB[top.moves[weakest]].power) weakest = i;
                }
                if (MOVES_DB[mv].power > MOVES_DB[top.moves[weakest]].power) {
                    const old = top.moves[weakest];
                    top.moves[weakest] = mv;
                    top.movePP[mv] = MOVES_DB[mv].pp;
                    delete top.movePP[old];
                    messages.push(`${top.name} forgot ${MOVES_DB[old].name} and learned ${MOVES_DB[mv].name}!`);
                }
            }
        });
        messages.push(`${top.name} grew to level ${top.level}!`);
        // Check evolution
        if (sp.evolveLevel && top.level >= sp.evolveLevel && sp.evolveTo !== undefined) {
            const newSp = SPECIES[sp.evolveTo];
            messages.push(`${top.name} is evolving into ${newSp.name}!`);
            top.speciesId = sp.evolveTo;
            top.species = newSp;
            top.name = newSp.name;
            top.type = newSp.type;
            const m2 = 1 + (top.level - 1) * 0.08;
            top.maxHp = Math.floor(newSp.baseHp * m2);
            top.hp = top.maxHp;
            top.atk = Math.floor(newSp.baseAtk * m2);
            top.def = Math.floor(newSp.baseDef * m2);
            top.spd = Math.floor(newSp.baseSpd * m2);
        }
    }
    return messages;
}

// ── Items Database ──────────────────────────────────────────
const ITEMS = {
    potion: { name: 'Potion', desc: 'Restores 30 HP.', price: 100, effect: 'heal', value: 30, emoji: '🧪' },
    super_potion: { name: 'Super Potion', desc: 'Restores 70 HP.', price: 300, effect: 'heal', value: 70, emoji: '💊' },
    max_potion: { name: 'Max Potion', desc: 'Fully restores HP.', price: 800, effect: 'heal', value: 9999, emoji: '💉' },
    spin_ball: { name: 'Spin Ball', desc: 'Used to catch wild tops.', price: 150, effect: 'catch', value: 1.0, emoji: '🔴' },
    great_ball: { name: 'Great Ball', desc: 'Better catch rate.', price: 400, effect: 'catch', value: 1.5, emoji: '🔵' },
    ultra_ball: { name: 'Ultra Ball', desc: 'High catch rate!', price: 800, effect: 'catch', value: 2.0, emoji: '🟡' },
    revive: { name: 'Revive', desc: 'Revives a fainted top.', price: 500, effect: 'revive', value: 0.5, emoji: '💫' },
    atk_boost: { name: 'ATK Snack', desc: '+5 ATK permanently.', price: 600, effect: 'stat_atk', value: 5, emoji: '🍖' },
    def_boost: { name: 'DEF Snack', desc: '+5 DEF permanently.', price: 600, effect: 'stat_def', value: 5, emoji: '🧁' },
    spd_boost: { name: 'SPD Snack', desc: '+5 SPD permanently.', price: 600, effect: 'stat_spd', value: 5, emoji: '🍬' },
};

// ── Tile Definitions ────────────────────────────────────────
const T = {
    GRASS: 0, PATH: 1, WATER: 2, TREE: 3, BUILDING: 4, TALL_GRASS: 5,
    FLOWER: 6, SAND: 7, ROCK: 8, DOOR: 9, SIGN: 10, FENCE: 11,
    BRIDGE: 12, CAVE_FLOOR: 13, CAVE_WALL: 14, DARK_GRASS: 15,
    SNOW: 16, ICE: 17, LAVA: 18, CHEST: 19
};
const WALKABLE = new Set([T.GRASS, T.PATH, T.TALL_GRASS, T.FLOWER, T.SAND, T.DOOR, T.BRIDGE, T.CAVE_FLOOR, T.DARK_GRASS, T.SNOW, T.ICE]);
const TILE_COLORS = {
    [T.GRASS]: '#5cb85c', [T.PATH]: '#d4a76a', [T.WATER]: '#4a9bd9',
    [T.TREE]: '#2d8a4e', [T.BUILDING]: '#8b7355', [T.TALL_GRASS]: '#3a8a3a',
    [T.FLOWER]: '#5cb85c', [T.SAND]: '#e8d4a0', [T.ROCK]: '#888888',
    [T.DOOR]: '#8b5a2b', [T.SIGN]: '#d4a76a', [T.FENCE]: '#a0522d',
    [T.BRIDGE]: '#b8860b', [T.CAVE_FLOOR]: '#555555', [T.CAVE_WALL]: '#333333',
    [T.DARK_GRASS]: '#2a6a2a', [T.SNOW]: '#e8e8f0', [T.ICE]: '#a0d4f0',
    [T.LAVA]: '#ff4422', [T.CHEST]: '#d4a76a'
};

// ── World Maps ──────────────────────────────────────────────
function makeMap(w, h, fill) {
    const m = [];
    for (let y = 0; y < h; y++) { m[y] = []; for (let x = 0; x < w; x++) m[y][x] = fill; }
    return m;
}
function setRect(map, x1, y1, x2, y2, tile) {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) if (map[y] && map[y][x] !== undefined) map[y][x] = tile;
}
function setBorder(map, x1, y1, x2, y2, tile) {
    for (let x = x1; x <= x2; x++) { if (map[y1]) map[y1][x] = tile; if (map[y2]) map[y2][x] = tile; }
    for (let y = y1; y <= y2; y++) { if (map[y]) { map[y][x1] = tile; map[y][x2] = tile; } }
}

// ZONE 0: Starter Town (Breezy Village)
function createStarterTown() {
    const m = makeMap(30, 25, T.GRASS);
    // Paths
    setRect(m, 0, 12, 29, 13, T.PATH);
    setRect(m, 14, 0, 15, 24, T.PATH);
    setRect(m, 5, 6, 24, 7, T.PATH);
    setRect(m, 5, 18, 24, 19, T.PATH);
    // Player's house
    setRect(m, 3, 3, 7, 5, T.BUILDING); m[6][5] = T.DOOR;
    // Professor's Lab
    setRect(m, 18, 3, 24, 6, T.BUILDING); m[7][21] = T.DOOR;
    // Shop
    setRect(m, 3, 15, 7, 17, T.BUILDING); m[18][5] = T.DOOR;
    // Healing Center
    setRect(m, 18, 15, 24, 17, T.BUILDING); m[18][21] = T.DOOR;
    // Flowers and decoration
    for (let i = 0; i < 20; i++) {
        const fx = Math.floor(Math.random() * 30);
        const fy = Math.floor(Math.random() * 25);
        if (m[fy][fx] === T.GRASS) m[fy][fx] = T.FLOWER;
    }
    // Trees border
    for (let x = 0; x < 30; x++) { m[0][x] = T.TREE; m[24][x] = T.TREE; }
    for (let y = 0; y < 25; y++) { m[y][0] = T.TREE; m[y][29] = T.TREE; }
    // Fences around houses
    for (let x = 2; x <= 8; x++) { m[2][x] = T.FENCE; m[8][x] = T.FENCE; }
    for (let x = 17; x <= 25; x++) { m[2][x] = T.FENCE; }
    // Water pond
    setRect(m, 10, 20, 13, 23, T.WATER);
    // Exit east (to Route 1)
    m[12][29] = T.PATH; m[13][29] = T.PATH;
    // Signs
    m[12][12] = T.SIGN; m[7][15] = T.SIGN;
    return m;
}

// ZONE 1: Route 1 (Green Path)
function createRoute1() {
    const m = makeMap(40, 20, T.GRASS);
    setRect(m, 0, 9, 39, 10, T.PATH);
    // Tall grass encounters
    setRect(m, 5, 3, 12, 7, T.TALL_GRASS);
    setRect(m, 18, 12, 25, 16, T.TALL_GRASS);
    setRect(m, 30, 3, 37, 8, T.TALL_GRASS);
    // Trees
    for (let x = 0; x < 40; x++) { m[0][x] = T.TREE; m[19][x] = T.TREE; }
    for (let y = 0; y < 20; y++) { m[y][0] = T.TREE; m[y][39] = T.TREE; }
    // Water
    setRect(m, 14, 14, 16, 17, T.WATER);
    // Flowers
    for (let i = 0; i < 15; i++) {
        const fx = 1 + Math.floor(Math.random() * 38);
        const fy = 1 + Math.floor(Math.random() * 18);
        if (m[fy][fx] === T.GRASS) m[fy][fx] = T.FLOWER;
    }
    // Entrances
    m[9][0] = T.PATH; m[10][0] = T.PATH;
    m[9][39] = T.PATH; m[10][39] = T.PATH;
    // Sign
    m[9][3] = T.SIGN;
    return m;
}

// ZONE 2: Sparkle City
function createSparkleCity() {
    const m = makeMap(35, 30, T.GRASS);
    // Main paths
    setRect(m, 0, 14, 34, 15, T.PATH);
    setRect(m, 16, 0, 17, 29, T.PATH);
    setRect(m, 5, 8, 28, 9, T.PATH);
    setRect(m, 5, 20, 28, 21, T.PATH);
    // Gym
    setRect(m, 3, 4, 9, 7, T.BUILDING); m[8][6] = T.DOOR;
    // Shop
    setRect(m, 22, 4, 28, 7, T.BUILDING); m[8][25] = T.DOOR;
    // Heal center
    setRect(m, 3, 16, 9, 19, T.BUILDING); m[20][6] = T.DOOR;
    // Houses
    setRect(m, 22, 16, 28, 19, T.BUILDING); m[20][25] = T.DOOR;
    setRect(m, 11, 22, 15, 25, T.BUILDING); m[26][13] = T.PATH; m[25][13] = T.DOOR;
    // Borders
    for (let x = 0; x < 35; x++) { m[0][x] = T.TREE; m[29][x] = T.TREE; }
    for (let y = 0; y < 30; y++) { m[y][0] = T.TREE; m[y][34] = T.TREE; }
    // Fountain (water in center)
    setRect(m, 15, 12, 18, 13, T.WATER);
    // Flowers
    m[11][15] = T.FLOWER; m[11][18] = T.FLOWER; m[14][14] = T.FLOWER; m[14][19] = T.FLOWER;
    // Exits
    m[14][0] = T.PATH; m[15][0] = T.PATH;
    m[14][34] = T.PATH; m[15][34] = T.PATH;
    m[29][16] = T.PATH; m[29][17] = T.PATH;
    // Signs
    m[14][3] = T.SIGN; m[9][16] = T.SIGN;
    return m;
}

// ZONE 3: Crystal Cave
function createCrystalCave() {
    const m = makeMap(30, 25, T.CAVE_WALL);
    // Carve paths
    setRect(m, 2, 2, 27, 22, T.CAVE_FLOOR);
    // Internal walls
    setRect(m, 8, 5, 12, 10, T.CAVE_WALL);
    setRect(m, 18, 12, 22, 18, T.CAVE_WALL);
    setRect(m, 5, 15, 8, 20, T.CAVE_WALL);
    // Dark grass (encounter areas)
    setRect(m, 14, 3, 20, 6, T.DARK_GRASS);
    setRect(m, 3, 8, 6, 13, T.DARK_GRASS);
    setRect(m, 22, 5, 26, 10, T.DARK_GRASS);
    setRect(m, 10, 18, 16, 21, T.DARK_GRASS);
    // Water pools
    setRect(m, 14, 9, 16, 11, T.WATER);
    setRect(m, 24, 19, 26, 21, T.WATER);
    // Chest
    m[4][26] = T.CHEST; m[20][4] = T.CHEST;
    // Exit
    m[12][0] = T.CAVE_FLOOR; m[0][15] = T.CAVE_FLOOR;
    return m;
}

// ZONE 4: Sunny Beach
function createSunnyBeach() {
    const m = makeMap(40, 20, T.SAND);
    // Water (ocean)
    setRect(m, 0, 14, 39, 19, T.WATER);
    // Tall grass
    setRect(m, 3, 3, 8, 6, T.TALL_GRASS);
    setRect(m, 25, 2, 32, 5, T.TALL_GRASS);
    // Path
    setRect(m, 0, 9, 39, 10, T.PATH);
    // Trees
    for (let x = 0; x < 40; x++) m[0][x] = T.TREE;
    for (let y = 0; y < 14; y++) { m[y][0] = T.TREE; m[y][39] = T.TREE; }
    // Bridge over water
    setRect(m, 18, 10, 19, 16, T.BRIDGE);
    // Rocks
    m[8][10] = T.ROCK; m[6][20] = T.ROCK; m[7][33] = T.ROCK;
    // Chest
    m[12][35] = T.CHEST;
    // Exits
    m[9][0] = T.PATH; m[10][0] = T.PATH;
    m[9][39] = T.PATH; m[10][39] = T.PATH;
    // Sign
    m[9][3] = T.SIGN;
    return m;
}

// ZONE 5: Thunder Peak
function createThunderPeak() {
    const m = makeMap(30, 30, T.ROCK);
    // Paths carved through
    setRect(m, 2, 14, 27, 15, T.PATH);
    setRect(m, 14, 2, 15, 27, T.PATH);
    // Open areas with tall grass
    setRect(m, 3, 3, 10, 8, T.GRASS);
    setRect(m, 5, 4, 8, 7, T.TALL_GRASS);
    setRect(m, 18, 3, 26, 10, T.GRASS);
    setRect(m, 20, 5, 24, 8, T.TALL_GRASS);
    setRect(m, 3, 18, 10, 26, T.GRASS);
    setRect(m, 4, 19, 8, 24, T.TALL_GRASS);
    setRect(m, 18, 18, 26, 26, T.GRASS);
    setRect(m, 20, 20, 25, 25, T.TALL_GRASS);
    // Gym building
    setRect(m, 11, 4, 17, 8, T.BUILDING); m[9][14] = T.DOOR;
    // Borders
    for (let x = 0; x < 30; x++) { m[0][x] = T.ROCK; m[29][x] = T.ROCK; }
    for (let y = 0; y < 30; y++) { m[y][0] = T.ROCK; m[y][29] = T.ROCK; }
    // Exits
    m[14][0] = T.PATH; m[15][0] = T.PATH;
    m[14][29] = T.PATH; m[15][29] = T.PATH;
    // Signs
    m[14][3] = T.SIGN;
    // Chest
    m[26][26] = T.CHEST;
    return m;
}

// ZONE 6: Shadow Valley
function createShadowValley() {
    const m = makeMap(35, 25, T.DARK_GRASS);
    // Paths
    setRect(m, 0, 12, 34, 13, T.PATH);
    setRect(m, 16, 0, 17, 24, T.PATH);
    // Water (dark pools)
    setRect(m, 5, 5, 8, 8, T.WATER);
    setRect(m, 25, 17, 28, 20, T.WATER);
    // Open areas
    setRect(m, 10, 3, 22, 5, T.GRASS);
    setRect(m, 10, 19, 22, 22, T.GRASS);
    // Gym
    setRect(m, 12, 7, 20, 10, T.BUILDING); m[11][16] = T.DOOR;
    // Trees
    for (let x = 0; x < 35; x++) { m[0][x] = T.TREE; m[24][x] = T.TREE; }
    for (let y = 0; y < 25; y++) { m[y][0] = T.TREE; m[y][34] = T.TREE; }
    // Exits
    m[12][0] = T.PATH; m[13][0] = T.PATH;
    m[12][34] = T.PATH; m[13][34] = T.PATH;
    // Chests
    m[4][30] = T.CHEST; m[22][4] = T.CHEST;
    // Signs
    m[12][3] = T.SIGN;
    return m;
}

// ZONE 7: Champion Arena
function createChampionArena() {
    const m = makeMap(25, 25, T.GRASS);
    // Grand path
    setRect(m, 11, 0, 13, 24, T.PATH);
    setRect(m, 3, 12, 21, 13, T.PATH);
    // Arena building
    setRect(m, 6, 3, 18, 8, T.BUILDING); m[9][12] = T.DOOR;
    // Heal center
    setRect(m, 3, 16, 8, 19, T.BUILDING); m[20][5] = T.DOOR; m[20][6] = T.PATH;
    // Shop
    setRect(m, 16, 16, 21, 19, T.BUILDING); m[20][18] = T.DOOR; m[20][19] = T.PATH;
    // Fountain
    setRect(m, 10, 11, 14, 14, T.WATER);
    m[12][12] = T.FLOWER;
    // Flowers
    for (let i = 0; i < 25; i++) {
        const fx = 1 + Math.floor(Math.random() * 23);
        const fy = 1 + Math.floor(Math.random() * 23);
        if (m[fy][fx] === T.GRASS) m[fy][fx] = T.FLOWER;
    }
    // Borders
    for (let x = 0; x < 25; x++) { m[0][x] = T.FENCE; m[24][x] = T.FENCE; }
    for (let y = 0; y < 25; y++) { m[y][0] = T.FENCE; m[y][24] = T.FENCE; }
    // Entry
    m[24][12] = T.PATH; m[24][13] = T.PATH;
    // Sign
    m[10][12] = T.SIGN;
    return m;
}

// ── Zone Definitions ────────────────────────────────────────
const ZONES = [
    { id: 0, name: 'Breezy Village', map: createStarterTown(), wildLevels: [2, 5], wilds: [17, 19, 15],
      music: 'town', encounters: { [T.TALL_GRASS]: [17, 19, 15] } },
    { id: 1, name: 'Route 1 — Green Path', map: createRoute1(), wildLevels: [3, 7], wilds: [9, 11, 17, 19],
      music: 'route', encounters: { [T.TALL_GRASS]: [9, 11, 17, 19] } },
    { id: 2, name: 'Sparkle City', map: createSparkleCity(), wildLevels: [5, 10], wilds: [],
      music: 'town', encounters: {} },
    { id: 3, name: 'Crystal Cave', map: createCrystalCave(), wildLevels: [8, 14], wilds: [13, 17, 21],
      music: 'cave', encounters: { [T.DARK_GRASS]: [13, 17, 21], [T.CAVE_FLOOR]: [17] } },
    { id: 4, name: 'Sunny Beach', map: createSunnyBeach(), wildLevels: [10, 16], wilds: [11, 15, 19],
      music: 'beach', encounters: { [T.TALL_GRASS]: [11, 15, 19] } },
    { id: 5, name: 'Thunder Peak', map: createThunderPeak(), wildLevels: [14, 22], wilds: [9, 13, 21],
      music: 'cave', encounters: { [T.TALL_GRASS]: [9, 13, 21] } },
    { id: 6, name: 'Shadow Valley', map: createShadowValley(), wildLevels: [18, 28], wilds: [13, 21, 19],
      music: 'cave', encounters: { [T.DARK_GRASS]: [13, 21, 19] } },
    { id: 7, name: 'Champion Arena', map: createChampionArena(), wildLevels: [25, 35], wilds: [],
      music: 'town', encounters: {} },
];

// Zone connections: { fromZone: [{ edge, toZone, toX, toY }] }
const ZONE_EXITS = [
    { from: 0, edge: 'east', to: 1, toX: 1, toY: 9 },
    { from: 1, edge: 'west', to: 0, toX: 28, toY: 12 },
    { from: 1, edge: 'east', to: 2, toX: 1, toY: 14 },
    { from: 2, edge: 'west', to: 1, toX: 38, toY: 9 },
    { from: 2, edge: 'east', to: 4, toX: 1, toY: 9 },
    { from: 4, edge: 'west', to: 2, toX: 33, toY: 14 },
    { from: 2, edge: 'south', to: 3, toX: 15, toY: 1 },
    { from: 3, edge: 'north', to: 2, toX: 16, toY: 28 },
    { from: 4, edge: 'east', to: 5, toX: 1, toY: 14 },
    { from: 5, edge: 'west', to: 4, toX: 38, toY: 9 },
    { from: 5, edge: 'east', to: 6, toX: 1, toY: 12 },
    { from: 6, edge: 'west', to: 5, toX: 28, toY: 14 },
    { from: 6, edge: 'east', to: 7, toX: 12, toY: 23 },
    { from: 7, edge: 'south', to: 6, toX: 33, toY: 12 },
];

// ── NPC Definitions ─────────────────────────────────────────
const NPCS = [
    // Zone 0: Starter Town
    { zone: 0, x: 21, y: 8, name: 'Prof. Spinner', emoji: '👨‍🔬', dir: 'down',
      dialogue: [
        { text: "Welcome to the world of Spin Clash!", next: 1 },
        { text: "I'm Professor Spinner. I study spinning tops!", next: 2 },
        { text: "These magical tops live all around us. Would you like to choose your very first partner?", choices: ['Yes please!', 'Tell me more first'], next: [3, 5] },
        { text: "Wonderful! Choose wisely — each one is special!", action: 'choose_starter', next: null },
        null,
        { text: "Spinning tops are creatures of pure spin energy. They battle by colliding! The one that keeps spinning wins!", next: 6 },
        { text: "There are 10 types of tops, each with strengths and weaknesses. Ready to pick your partner?", choices: ['Yes!', 'Not yet'], next: [3, null] },
      ]},
    { zone: 0, x: 5, y: 7, name: 'Mom', emoji: '👩', dir: 'down',
      dialogue: [
        { text: "Good morning sweetie! Professor Spinner is waiting for you in his lab to the east!", next: 1 },
        { text: "Be careful out there! And remember to visit the Healing Center if your tops get hurt! 💕", next: null },
      ]},
    { zone: 0, x: 5, y: 19, name: 'Shopkeeper Mel', emoji: '🧑‍💼', dir: 'down',
      dialogue: [
        { text: "Welcome to Mel's Mart! What would you like?", action: 'shop', shop: ['potion','super_potion','spin_ball','revive'], next: null },
      ]},
    { zone: 0, x: 21, y: 19, name: 'Nurse Joy', emoji: '👩‍⚕️', dir: 'down',
      dialogue: [
        { text: "Welcome to the Healing Center! Let me heal your tops!", next: 1 },
        { text: "... ✨ All your spinning tops are fully healed! ✨", action: 'heal', next: null },
      ]},
    { zone: 0, x: 15, y: 8, name: 'Old Timer Jake', emoji: '👴', dir: 'down',
      dialogue: [
        { text: "Back in my day, we spun tops with our bare hands!", next: 1 },
        { text: "These fancy battle tops... they've got a mind of their own now!", next: 2 },
        { text: "Walk through the tall grass outside town to find wild tops. Good luck, youngster!", next: null },
      ]},
    { zone: 0, x: 12, y: 13, name: 'Sign', emoji: '🪧', dir: 'down', isSign: true,
      dialogue: [{ text: "↑ Prof. Spinner's Lab  ↓ Pond\n← Home  → Route 1", next: null }] },
    { zone: 0, x: 15, y: 8, name: 'Sign', emoji: '🪧', dir: 'down', isSign: true,
      dialogue: [{ text: "Breezy Village — Where Every Journey Begins! 🌸", next: null }] },

    // Zone 1: Route 1
    { zone: 1, x: 15, y: 9, name: 'Trainer Billy', emoji: '🧑', dir: 'left',
      dialogue: [
        { text: "Hey! You've got spinning tops too? Let's battle!", action: 'battle',
          team: [createTop(17, 5), createTop(19, 6)], next: null },
      ], defeated: false, defeatMsg: "Wow, you're strong! Keep going east to Sparkle City!" },
    { zone: 1, x: 28, y: 6, name: 'Trainer Luna', emoji: '👧', dir: 'down',
      dialogue: [
        { text: "I love training in tall grass! Battle me!", action: 'battle',
          team: [createTop(15, 6), createTop(11, 7)], next: null },
      ], defeated: false, defeatMsg: "You're really good! There are stronger trainers ahead!" },
    { zone: 1, x: 3, y: 10, name: 'Sign', emoji: '🪧', dir: 'down', isSign: true,
      dialogue: [{ text: "Route 1 — Green Path\n← Breezy Village  → Sparkle City\nWatch for wild tops in tall grass!", next: null }] },

    // Zone 2: Sparkle City
    { zone: 2, x: 6, y: 9, name: 'Gym Leader Volt', emoji: '⚡', dir: 'down',
      dialogue: [
        { text: "I am Volt, the Electric Gym Leader! Think you can handle my shocking power?", choices: ['Bring it on!', 'Not ready yet'], next: [1, null] },
        { text: "Let's see what you've got!", action: 'battle',
          team: [createTop(9, 12), createTop(10, 14), createTop(9, 13)], badge: 'Thunder Badge', next: null },
      ], defeated: false, defeatMsg: "Impressive! Take the Thunder Badge! ⚡ You've earned it!" },
    { zone: 2, x: 25, y: 9, name: 'Shopkeeper Rex', emoji: '🧑‍💼', dir: 'down',
      dialogue: [
        { text: "Welcome to Rex's Premium Shop!", action: 'shop', shop: ['potion','super_potion','max_potion','spin_ball','great_ball','revive','atk_boost'], next: null },
      ]},
    { zone: 2, x: 6, y: 21, name: 'Nurse Grace', emoji: '👩‍⚕️', dir: 'down',
      dialogue: [
        { text: "Oh my, your tops look tired! Let me fix them right up!", next: 1 },
        { text: "... ✨ All healed up and ready to spin! ✨", action: 'heal', next: null },
      ]},
    { zone: 2, x: 25, y: 21, name: 'Move Tutor', emoji: '🧙', dir: 'down',
      dialogue: [
        { text: "I'm the Move Tutor! I can teach your tops powerful techniques!", next: 1 },
        { text: "...Actually, your tops learn moves naturally as they level up. Keep training! 😊", next: null },
      ]},
    { zone: 2, x: 16, y: 10, name: 'Sign', emoji: '🪧', dir: 'down', isSign: true,
      dialogue: [{ text: "Sparkle City — City of Electric Dreams!\n↑ Gym  ↓ Crystal Cave\n← Route 1  → Sunny Beach", next: null }] },
    { zone: 2, x: 13, y: 26, name: 'Kid Sam', emoji: '👦', dir: 'right',
      dialogue: [
        { text: "Did you know? If you catch all the different types of tops, something amazing happens!", next: 1 },
        { text: "...At least that's what my big sister told me! 😄", next: null },
      ]},

    // Zone 3: Crystal Cave
    { zone: 3, x: 15, y: 12, name: 'Explorer Maya', emoji: '🧗', dir: 'left',
      dialogue: [
        { text: "These caves are full of rare tops! I found a Shady and a Twinkle down here!", next: 1 },
        { text: "Be careful though, the wild tops here are tough! Wanna battle to warm up?", choices: ['Sure!', 'No thanks'], next: [2, null] },
        { text: "Here we go!", action: 'battle',
          team: [createTop(13, 10), createTop(21, 11), createTop(17, 12)], next: null },
      ], defeated: false, defeatMsg: "Great battle! Keep exploring — there are chests hidden in the corners!" },

    // Zone 4: Sunny Beach
    { zone: 4, x: 19, y: 8, name: 'Surfer Kai', emoji: '🏄', dir: 'down',
      dialogue: [
        { text: "Cowabunga dude! The waves are sick today and so are my tops! Battle?", choices: ['Yeah!', 'Nah bro'], next: [1, null] },
        { text: "Radical! Let's ride!", action: 'battle',
          team: [createTop(11, 14), createTop(12, 16), createTop(19, 15)], next: null },
      ], defeated: false, defeatMsg: "Tubular battle dude! Keep shredding!" },
    { zone: 4, x: 3, y: 10, name: 'Sign', emoji: '🪧', dir: 'down', isSign: true,
      dialogue: [{ text: "Sunny Beach — Surf, Sand, and Spin!\n← Sparkle City  → Thunder Peak", next: null }] },

    // Zone 5: Thunder Peak
    { zone: 5, x: 14, y: 10, name: 'Gym Leader Terra', emoji: '⛰️', dir: 'down',
      dialogue: [
        { text: "I am Terra, master of Earth and Thunder! You need the Thunder Badge to challenge me.", choices: ['I have it!', 'Not yet...'], next: [1, null] },
        { text: "Very well! Prepare for the fight of your life!", action: 'battle',
          team: [createTop(18, 22), createTop(10, 24), createTop(18, 25), createTop(9, 23)], badge: 'Mountain Badge', next: null },
      ], defeated: false, defeatMsg: "The mountain acknowledges your strength! Take the Mountain Badge! ⛰️" },
    { zone: 5, x: 3, y: 15, name: 'Sign', emoji: '🪧', dir: 'down', isSign: true,
      dialogue: [{ text: "Thunder Peak — Where Lightning Meets Stone!\n← Sunny Beach  → Shadow Valley", next: null }] },

    // Zone 6: Shadow Valley
    { zone: 6, x: 16, y: 12, name: 'Gym Leader Nyx', emoji: '🌙', dir: 'down',
      dialogue: [
        { text: "The shadows whisper your name... I am Nyx. Do you dare challenge darkness itself?", choices: ['I do!', 'I need to prepare'], next: [1, null] },
        { text: "Then let the shadows judge you!", action: 'battle',
          team: [createTop(14, 28), createTop(22, 27), createTop(14, 30), createTop(13, 29)], badge: 'Shadow Badge', next: null },
      ], defeated: false, defeatMsg: "The shadows bow to you. Take the Shadow Badge... you've earned the right to face the Champion! 🌙" },
    { zone: 6, x: 3, y: 13, name: 'Sign', emoji: '🪧', dir: 'down', isSign: true,
      dialogue: [{ text: "Shadow Valley — Embrace the Darkness\n← Thunder Peak  → Champion Arena", next: null }] },

    // Zone 7: Champion Arena
    { zone: 7, x: 12, y: 10, name: 'Champion Aria', emoji: '👑', dir: 'down',
      dialogue: [
        { text: "So you've collected all three badges and made it here... I am Aria, the Spin Champion!", next: 1 },
        { text: "This will be the ultimate battle! Are you ready?", choices: ['Born ready!', 'Let me prepare'], next: [2, null] },
        { text: "Then let's make this legendary! 🌟", action: 'battle',
          team: [createTop(2, 35), createTop(5, 34), createTop(8, 33), createTop(22, 35), createTop(10, 34), createTop(14, 36)],
          badge: 'Champion Crown', next: null },
      ], defeated: false, defeatMsg: "Incredible... you've done it! You are the new SPIN CHAMPION! 👑🎉" },
    { zone: 7, x: 5, y: 21, name: 'Nurse Belle', emoji: '👩‍⚕️', dir: 'down',
      dialogue: [
        { text: "This is the Champion's Healing Center. Let me restore your team!", next: 1 },
        { text: "... ✨ Fully healed and battle-ready! ✨", action: 'heal', next: null },
      ]},
    { zone: 7, x: 18, y: 21, name: 'Elite Shop', emoji: '🧑‍💼', dir: 'down',
      dialogue: [
        { text: "Welcome to the Elite Shop — only the best for challengers!", action: 'shop',
          shop: ['max_potion','ultra_ball','revive','atk_boost','def_boost','spd_boost'], next: null },
      ]},
    { zone: 7, x: 12, y: 11, name: 'Sign', emoji: '🪧', dir: 'down', isSign: true,
      dialogue: [{ text: "Champion Arena — Only the worthy may enter! 👑", next: null }] },
];

// ── Quests ───────────────────────────────────────────────────
const QUESTS = [
    { id: 'q_starter', name: 'My First Partner', desc: 'Get your first spinning top from Professor Spinner.', zone: 0, reward: { gold: 200 }, check: gs => gs.team.length > 0 },
    { id: 'q_catch5', name: 'Collector', desc: 'Catch 5 different species of spinning tops.', reward: { gold: 500, item: { id: 'great_ball', qty: 5 } }, check: gs => { const s = new Set(gs.team.map(t => t.speciesId)); return s.size >= 5; } },
    { id: 'q_catch10', name: 'Mega Collector', desc: 'Catch 10 different species!', reward: { gold: 1000, item: { id: 'ultra_ball', qty: 5 } }, check: gs => { const s = new Set(gs.team.map(t => t.speciesId)); return s.size >= 10; } },
    { id: 'q_badge1', name: 'Thunder Badge', desc: 'Defeat Gym Leader Volt in Sparkle City.', reward: { gold: 800 }, check: gs => gs.badges.includes('Thunder Badge') },
    { id: 'q_badge2', name: 'Mountain Badge', desc: 'Defeat Gym Leader Terra at Thunder Peak.', reward: { gold: 1200 }, check: gs => gs.badges.includes('Mountain Badge') },
    { id: 'q_badge3', name: 'Shadow Badge', desc: 'Defeat Gym Leader Nyx in Shadow Valley.', reward: { gold: 1500 }, check: gs => gs.badges.includes('Shadow Badge') },
    { id: 'q_champion', name: 'Spin Champion!', desc: 'Defeat Champion Aria and become the champion!', reward: { gold: 5000 }, check: gs => gs.badges.includes('Champion Crown') },
    { id: 'q_lvl20', name: 'Seasoned Spinner', desc: 'Get a top to level 20.', reward: { gold: 600, item: { id: 'super_potion', qty: 5 } }, check: gs => gs.team.some(t => t.level >= 20) },
    { id: 'q_lvl50', name: 'Legendary Spinner', desc: 'Get a top to level 50!', reward: { gold: 3000 }, check: gs => gs.team.some(t => t.level >= 50) },
    { id: 'q_evolve', name: 'Evolution!', desc: 'Evolve a spinning top for the first time.', reward: { gold: 400 }, check: gs => gs.evolved },
];

// ── Game State ───────────────────────────────────────────────
let GS = {
    screen: 'title', // title, world, battle, dialogue, menu, shop, starter_select, team_view, bag
    player: { x: 5 * TILE, y: 10 * TILE, dir: 'down', moving: false, frame: 0, stepCooldown: 0 },
    zone: 0,
    team: [],
    box: [], // storage for extra tops
    bag: { potion: 3, spin_ball: 5 },
    gold: 500,
    badges: [],
    questsDone: [],
    flags: {},
    evolved: false,
    chestsOpened: {},
    trainersDefeated: {},
    battleCount: 0,
    playTime: 0,
    // Battle state
    battle: null,
    // Dialogue state
    dialogue: null,
    // Menu state
    menu: { open: false, cursor: 0 },
    // Shop state
    shop: null,
    // Camera
    cam: { x: 0, y: 0 },
    // Transition
    transition: { active: false, alpha: 0, target: null, callback: null },
    // Particles
    particles: [],
    // Notifications
    notifications: [],
    // Time
    dayNightCycle: 0,
    // Screen shake
    shake: { x: 0, y: 0, intensity: 0 },
};

// ── Input ────────────────────────────────────────────────────
const keys = {};
let touchDirs = {};
document.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; ensureAudio(); e.preventDefault(); });
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// D-pad
document.querySelectorAll('.dpad-btn').forEach(btn => {
    const dir = btn.dataset.dir;
    btn.addEventListener('touchstart', e => { e.preventDefault(); touchDirs[dir] = true; ensureAudio(); });
    btn.addEventListener('touchend', e => { e.preventDefault(); touchDirs[dir] = false; });
    btn.addEventListener('mousedown', e => { touchDirs[dir] = true; ensureAudio(); });
    btn.addEventListener('mouseup', e => { touchDirs[dir] = false; });
});
// Action buttons
let btnAPressed = false, btnBPressed = false;
const btnA = document.getElementById('btnA');
const btnB = document.getElementById('btnB');
if (btnA) {
    btnA.addEventListener('touchstart', e => { e.preventDefault(); btnAPressed = true; ensureAudio(); });
    btnA.addEventListener('touchend', e => { e.preventDefault(); btnAPressed = false; });
    btnA.addEventListener('mousedown', () => { btnAPressed = true; ensureAudio(); });
    btnA.addEventListener('mouseup', () => { btnAPressed = false; });
}
if (btnB) {
    btnB.addEventListener('touchstart', e => { e.preventDefault(); btnBPressed = true; ensureAudio(); });
    btnB.addEventListener('touchend', e => { e.preventDefault(); btnBPressed = false; });
    btnB.addEventListener('mousedown', () => { btnBPressed = true; ensureAudio(); });
    btnB.addEventListener('mouseup', () => { btnBPressed = false; });
}

function isDown(dir) {
    if (touchDirs[dir]) return true;
    switch (dir) {
        case 'up': return keys['arrowup'] || keys['w'];
        case 'down': return keys['arrowdown'] || keys['s'];
        case 'left': return keys['arrowleft'] || keys['a'];
        case 'right': return keys['arrowright'] || keys['d'];
    }
    return false;
}
function actionPressed() { return keys['z'] || keys[' '] || keys['enter'] || btnAPressed; }
function cancelPressed() { return keys['x'] || keys['escape'] || keys['backspace'] || btnBPressed; }

let lastAction = false, lastCancel = false;
function actionJustPressed() { const r = actionPressed() && !lastAction; return r; }
function cancelJustPressed() { const r = cancelPressed() && !lastCancel; return r; }

// ── Rendering Helpers ────────────────────────────────────────
function drawRoundRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}
function drawTextBox(text, x, y, w, h, options = {}) {
    const bg = options.bg || 'rgba(20,20,40,0.92)';
    const border = options.border || '#ffffff';
    drawRoundRect(x, y, w, h, 12, bg, border);
    ctx.fillStyle = options.color || '#ffffff';
    ctx.font = options.font || '16px Fredoka One, Nunito, cursive';
    ctx.textAlign = options.align || 'left';
    const lines = text.split('\n');
    const lineH = options.lineH || 22;
    const padX = options.padX || 16;
    const padY = options.padY || 24;
    lines.forEach((line, i) => {
        ctx.fillText(line, x + padX, y + padY + i * lineH);
    });
}

function drawBar(x, y, w, h, pct, color, bgColor = '#333') {
    drawRoundRect(x, y, w, h, h / 2, bgColor);
    if (pct > 0) drawRoundRect(x, y, Math.max(w * pct, h), h, h / 2, color);
}

function addParticle(x, y, color, life, vx, vy, size) {
    GS.particles.push({ x, y, color, life, maxLife: life, vx: vx || (Math.random() - 0.5) * 3, vy: vy || (Math.random() - 0.5) * 3, size: size || 4 });
}
function addNotification(text, duration = 3000) {
    GS.notifications.push({ text, time: duration, maxTime: duration });
}

// ── Draw Tile ────────────────────────────────────────────────
function drawTile(tileType, sx, sy, time) {
    const c = TILE_COLORS[tileType] || '#000';
    ctx.fillStyle = c;
    ctx.fillRect(sx, sy, TILE, TILE);

    switch (tileType) {
        case T.GRASS:
            ctx.fillStyle = '#4da84d';
            for (let i = 0; i < 3; i++) {
                const gx = sx + 8 + i * 14;
                const gy = sy + 30 + Math.sin(time / 500 + i) * 2;
                ctx.fillRect(gx, gy, 2, 8);
            }
            break;
        case T.TALL_GRASS:
            ctx.fillStyle = '#2d7a2d';
            for (let i = 0; i < 5; i++) {
                const gx = sx + 4 + i * 9;
                const gy = sy + 15 + Math.sin(time / 400 + i) * 3;
                ctx.fillRect(gx, gy, 3, 20);
                ctx.fillRect(gx - 2, gy, 7, 2);
            }
            break;
        case T.DARK_GRASS:
            ctx.fillStyle = '#1a5a1a';
            for (let i = 0; i < 5; i++) {
                const gx = sx + 4 + i * 9;
                const gy = sy + 12 + Math.sin(time / 350 + i) * 4;
                ctx.fillRect(gx, gy, 3, 24);
                ctx.fillRect(gx - 3, gy + 2, 9, 2);
            }
            break;
        case T.WATER:
            ctx.fillStyle = '#5aadea';
            ctx.fillRect(sx + 4, sy + 12 + Math.sin(time / 600) * 3, 18, 3);
            ctx.fillRect(sx + 24, sy + 28 + Math.sin(time / 500 + 2) * 3, 16, 3);
            break;
        case T.TREE:
            ctx.fillStyle = '#5a3a1a';
            ctx.fillRect(sx + 18, sy + 28, 12, 20);
            ctx.fillStyle = '#1a7a3a';
            ctx.beginPath();
            ctx.arc(sx + 24, sy + 20, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#2d8a4e';
            ctx.beginPath();
            ctx.arc(sx + 20, sy + 16, 12, 0, Math.PI * 2);
            ctx.fill();
            break;
        case T.FLOWER:
            ctx.fillStyle = '#4da84d';
            ctx.fillRect(sx, sy, TILE, TILE);
            const colors = ['#ff6688','#ffaa44','#ff88dd','#88aaff','#ffff66'];
            const fc = colors[(Math.floor(sx / TILE) + Math.floor(sy / TILE)) % colors.length];
            ctx.fillStyle = fc;
            ctx.beginPath();
            ctx.arc(sx + 24 + Math.sin(time / 700) * 2, sy + 24, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffee55';
            ctx.beginPath();
            ctx.arc(sx + 24 + Math.sin(time / 700) * 2, sy + 24, 3, 0, Math.PI * 2);
            ctx.fill();
            break;
        case T.BUILDING:
            ctx.fillStyle = '#a08060';
            ctx.fillRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
            ctx.fillStyle = '#705030';
            ctx.fillRect(sx + 4, sy + 4, TILE - 8, 4);
            ctx.fillStyle = '#80c8ff';
            ctx.fillRect(sx + 12, sy + 14, 10, 10);
            ctx.fillRect(sx + 26, sy + 14, 10, 10);
            break;
        case T.DOOR:
            ctx.fillStyle = '#d4a76a';
            ctx.fillRect(sx, sy, TILE, TILE);
            ctx.fillStyle = '#6a3a1a';
            ctx.fillRect(sx + 14, sy + 4, 20, TILE - 4);
            ctx.fillStyle = '#ffdd44';
            ctx.beginPath();
            ctx.arc(sx + 30, sy + 24, 3, 0, Math.PI * 2);
            ctx.fill();
            break;
        case T.FENCE:
            ctx.fillStyle = '#5cb85c';
            ctx.fillRect(sx, sy, TILE, TILE);
            ctx.fillStyle = '#b08050';
            ctx.fillRect(sx, sy + 16, TILE, 4);
            ctx.fillRect(sx, sy + 30, TILE, 4);
            ctx.fillRect(sx + 8, sy + 12, 4, 26);
            ctx.fillRect(sx + 36, sy + 12, 4, 26);
            break;
        case T.BRIDGE:
            ctx.fillStyle = '#b8860b';
            ctx.fillRect(sx + 2, sy, TILE - 4, TILE);
            ctx.fillStyle = '#daa520';
            ctx.fillRect(sx + 6, sy, 4, TILE);
            ctx.fillRect(sx + TILE - 10, sy, 4, TILE);
            break;
        case T.ROCK:
            ctx.fillStyle = '#777';
            ctx.beginPath();
            ctx.arc(sx + 24, sy + 28, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#999';
            ctx.beginPath();
            ctx.arc(sx + 20, sy + 24, 10, 0, Math.PI * 2);
            ctx.fill();
            break;
        case T.SIGN:
            ctx.fillStyle = '#d4a76a';
            ctx.fillRect(sx, sy, TILE, TILE);
            ctx.fillStyle = '#8b5a2b';
            ctx.fillRect(sx + 18, sy + 28, 12, 16);
            ctx.fillStyle = '#daa520';
            ctx.fillRect(sx + 10, sy + 10, 28, 20);
            ctx.fillStyle = '#8b5a2b';
            ctx.fillRect(sx + 14, sy + 16, 20, 2);
            ctx.fillRect(sx + 14, sy + 22, 16, 2);
            break;
        case T.CAVE_FLOOR:
            ctx.fillStyle = '#4a4a4a';
            ctx.fillRect(sx + 10, sy + 8, 4, 4);
            ctx.fillRect(sx + 30, sy + 32, 6, 4);
            break;
        case T.CAVE_WALL:
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
            ctx.fillStyle = '#3a3a3a';
            ctx.fillRect(sx + 6, sy + 6, 12, 8);
            ctx.fillRect(sx + 28, sy + 24, 10, 8);
            break;
        case T.SAND:
            ctx.fillStyle = '#d4bf8a';
            ctx.fillRect(sx + 10, sy + 20, 6, 2);
            ctx.fillRect(sx + 30, sy + 10, 8, 2);
            break;
        case T.SNOW:
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(sx + 12, sy + 30, 4, 0, Math.PI * 2);
            ctx.arc(sx + 36, sy + 14, 3, 0, Math.PI * 2);
            ctx.fill();
            break;
        case T.ICE:
            ctx.fillStyle = '#c0e8ff';
            ctx.fillRect(sx + 8, sy + 8, 16, 2);
            ctx.fillRect(sx + 28, sy + 28, 12, 2);
            break;
        case T.CHEST:
            ctx.fillStyle = '#d4a76a';
            ctx.fillRect(sx, sy, TILE, TILE);
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(sx + 10, sy + 16, 28, 22);
            ctx.fillStyle = '#B8860B';
            ctx.fillRect(sx + 12, sy + 18, 24, 18);
            ctx.fillStyle = '#FFD700';
            ctx.fillRect(sx + 20, sy + 24, 8, 6);
            break;
    }
}

// ── Draw Spinning Top (cute character) ──────────────────────
function drawSpinningTop(x, y, species, size, spin, hp, maxHp, isEnemy) {
    const time = Date.now();
    const color = species.color;
    const bobY = Math.sin(time / 300) * 3;

    ctx.save();
    ctx.translate(x, y + bobY);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.6, size * 0.7, size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Spin effect (ring)
    if (spin > 0) {
        ctx.strokeStyle = color + '44';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 0, size + 8 + Math.sin(time / 100) * 4, size * 0.5 + 4, spin, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Body (top shape)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.6);
    ctx.quadraticCurveTo(-size, size * 0.1, -size * 0.8, -size * 0.2);
    ctx.quadraticCurveTo(-size * 0.5, -size * 0.8, 0, -size * 0.7);
    ctx.quadraticCurveTo(size * 0.5, -size * 0.8, size * 0.8, -size * 0.2);
    ctx.quadraticCurveTo(size, size * 0.1, 0, size * 0.6);
    ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(-size * 0.2, -size * 0.3, size * 0.3, size * 0.2, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Type emblem circle
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(0, -size * 0.1, size * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Cute face
    const faceY = -size * 0.15;
    // Eyes
    const blink = Math.sin(time / 2000) > 0.95;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-size * 0.2, faceY, size * 0.12, blink ? 1 : size * 0.14, 0, 0, Math.PI * 2);
    ctx.ellipse(size * 0.2, faceY, size * 0.12, blink ? 1 : size * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    if (!blink) {
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(-size * 0.2, faceY + 2, size * 0.06, 0, Math.PI * 2);
        ctx.arc(size * 0.2, faceY + 2, size * 0.06, 0, Math.PI * 2);
        ctx.fill();
        // Eye shine
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-size * 0.23, faceY - 1, size * 0.03, 0, Math.PI * 2);
        ctx.arc(size * 0.17, faceY - 1, size * 0.03, 0, Math.PI * 2);
        ctx.fill();
    }

    // Mouth
    if (hp !== undefined && hp < maxHp * 0.3) {
        // Worried mouth
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, faceY + size * 0.25, size * 0.1, Math.PI, 0);
        ctx.stroke();
    } else {
        // Happy mouth
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, faceY + size * 0.15, size * 0.12, 0, Math.PI);
        ctx.stroke();
    }

    // Blush cheeks
    ctx.fillStyle = 'rgba(255,150,150,0.4)';
    ctx.beginPath();
    ctx.ellipse(-size * 0.35, faceY + size * 0.12, size * 0.08, size * 0.05, 0, 0, Math.PI * 2);
    ctx.ellipse(size * 0.35, faceY + size * 0.12, size * 0.08, size * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tip (bottom point)
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.moveTo(-4, size * 0.5);
    ctx.lineTo(4, size * 0.5);
    ctx.lineTo(0, size * 0.8);
    ctx.closePath();
    ctx.fill();

    // Type emoji on top
    ctx.font = `${Math.floor(size * 0.35)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(TYPE_EMOJI[species.type], 0, -size * 0.5);

    ctx.restore();
}

// ── Draw Player Character ────────────────────────────────────
function drawPlayer(px, py, dir, frame, time) {
    ctx.save();
    ctx.translate(px + TILE / 2, py + TILE / 2);

    const bobY = Math.sin(time / 200 + frame) * (GS.player.moving ? 3 : 1);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 18, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = '#4a90d9';
    ctx.beginPath();
    ctx.arc(0, 4 + bobY, 14, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = '#ffcc99';
    ctx.beginPath();
    ctx.arc(0, -10 + bobY, 12, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = '#5a3a1a';
    ctx.beginPath();
    ctx.arc(0, -16 + bobY, 12, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-12, -16 + bobY, 24, 4);

    // Hat
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(0, -18 + bobY, 10, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-14, -18 + bobY, 28, 4);

    // Eyes (direction-aware)
    const eyeOff = dir === 'left' ? -3 : dir === 'right' ? 3 : 0;
    const eyeYOff = dir === 'up' ? -2 : dir === 'down' ? 2 : 0;
    const blink = Math.sin(time / 3000) > 0.97;
    ctx.fillStyle = '#222';
    if (!blink) {
        ctx.beginPath();
        ctx.arc(-4 + eyeOff, -10 + eyeYOff + bobY, 2, 0, Math.PI * 2);
        ctx.arc(4 + eyeOff, -10 + eyeYOff + bobY, 2, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillRect(-6 + eyeOff, -10 + eyeYOff + bobY, 4, 1);
        ctx.fillRect(2 + eyeOff, -10 + eyeYOff + bobY, 4, 1);
    }

    // Smile
    if (dir !== 'up') {
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0 + eyeOff * 0.5, -6 + bobY, 4, 0.1, Math.PI - 0.1);
        ctx.stroke();
    }

    // Legs (walking animation)
    ctx.fillStyle = '#336699';
    if (GS.player.moving) {
        const legOff = Math.sin(time / 100) * 5;
        ctx.fillRect(-6, 16 + bobY, 5, 8 + legOff);
        ctx.fillRect(1, 16 + bobY, 5, 8 - legOff);
    } else {
        ctx.fillRect(-6, 16 + bobY, 5, 8);
        ctx.fillRect(1, 16 + bobY, 5, 8);
    }

    // Shoes
    ctx.fillStyle = '#cc3333';
    ctx.fillRect(-7, 23 + bobY, 6, 3);
    ctx.fillRect(1, 23 + bobY, 6, 3);

    ctx.restore();
}

// ── Draw NPC ─────────────────────────────────────────────────
function drawNPC(npc, sx, sy, time) {
    ctx.save();
    ctx.translate(sx + TILE / 2, sy + TILE / 2);

    const bobY = Math.sin(time / 500 + npc.x * 7) * 2;

    if (npc.isSign) {
        ctx.restore();
        return;
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(0, 18, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Emoji as character
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(npc.emoji, 0, -2 + bobY);

    // Name label
    ctx.font = '10px Fredoka One, cursive';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(npc.name, 0, -24 + bobY);

    // Interaction indicator
    const px = GS.player.x / TILE, py = GS.player.y / TILE;
    const dist = Math.abs(px - npc.x) + Math.abs(py - npc.y);
    if (dist <= 2 && !npc.isSign) {
        ctx.fillStyle = '#ffdd44';
        ctx.font = '14px sans-serif';
        ctx.fillText('!', 0, -34 + Math.sin(time / 300) * 3);
    }

    ctx.restore();
}

// ── Tile drawing helpers ──────────────────────────────────────
function getTile(zone, tx, ty) {
    const map = ZONES[zone].map;
    if (ty < 0 || ty >= map.length || tx < 0 || tx >= map[0].length) return -1;
    return map[ty][tx];
}

// ── Save / Load ──────────────────────────────────────────────
function saveGame() {
    try {
        const save = {
            player: GS.player,
            zone: GS.zone,
            team: GS.team,
            box: GS.box,
            bag: GS.bag,
            gold: GS.gold,
            badges: GS.badges,
            questsDone: GS.questsDone,
            flags: GS.flags,
            evolved: GS.evolved,
            chestsOpened: GS.chestsOpened,
            trainersDefeated: GS.trainersDefeated,
            battleCount: GS.battleCount,
            playTime: GS.playTime,
        };
        localStorage.setItem('spinclash_save', JSON.stringify(save));
    } catch (e) {}
}
function loadGame() {
    try {
        const raw = localStorage.getItem('spinclash_save');
        if (!raw) return false;
        const save = JSON.parse(raw);
        Object.assign(GS, save);
        // Rebuild species refs
        GS.team.forEach(t => { t.species = SPECIES[t.speciesId]; });
        GS.box.forEach(t => { t.species = SPECIES[t.speciesId]; });
        return true;
    } catch (e) { return false; }
}

// ── Transition Effect ────────────────────────────────────────
function startTransition(callback) {
    GS.transition = { active: true, alpha: 0, phase: 'out', callback };
}

// ── Screen Shake ─────────────────────────────────────────────
function screenShake(intensity) {
    GS.shake.intensity = intensity;
}

// ══════════════════════════════════════════════════════════════
// TITLE SCREEN
// ══════════════════════════════════════════════════════════════
function updateTitle() {
    if (actionJustPressed()) {
        sfx('confirm');
        const loaded = loadGame();
        if (loaded && GS.team.length > 0) {
            GS.screen = 'world';
        } else {
            GS.screen = 'world';
            GS.player = { x: 14 * TILE, y: 10 * TILE, dir: 'down', moving: false, frame: 0, stepCooldown: 0 };
            GS.zone = 0;
        }
    }
}

function drawTitle(time) {
    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#1a0a3a');
    grad.addColorStop(0.5, '#2a1a5a');
    grad.addColorStop(1, '#0a0a2a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Stars
    for (let i = 0; i < 60; i++) {
        const sx = (Math.sin(i * 127.1) * 0.5 + 0.5) * canvas.width;
        const sy = (Math.cos(i * 311.7) * 0.5 + 0.5) * canvas.height * 0.6;
        const brightness = 0.3 + Math.sin(time / 500 + i) * 0.3;
        ctx.fillStyle = `rgba(255,255,220,${brightness})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Spinning tops floating
    const tops = [
        { sp: SPECIES[0], x: canvas.width * 0.2, y: canvas.height * 0.35 },
        { sp: SPECIES[3], x: canvas.width * 0.5, y: canvas.height * 0.28 },
        { sp: SPECIES[6], x: canvas.width * 0.8, y: canvas.height * 0.35 },
        { sp: SPECIES[9], x: canvas.width * 0.35, y: canvas.height * 0.55 },
        { sp: SPECIES[21], x: canvas.width * 0.65, y: canvas.height * 0.55 },
    ];
    tops.forEach((t, i) => {
        drawSpinningTop(t.x, t.y + Math.sin(time / 600 + i * 1.5) * 15, t.sp, 28, time / 500);
    });

    // Title
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Title shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = 'bold 52px Fredoka One, cursive';
    ctx.fillText('SPIN CLASH', canvas.width / 2 + 3, canvas.height * 0.15 + 3);

    // Title rainbow
    const titleGrad = ctx.createLinearGradient(canvas.width / 2 - 200, 0, canvas.width / 2 + 200, 0);
    titleGrad.addColorStop(0, '#ff6644');
    titleGrad.addColorStop(0.25, '#ffdd44');
    titleGrad.addColorStop(0.5, '#44dd88');
    titleGrad.addColorStop(0.75, '#44aaff');
    titleGrad.addColorStop(1, '#dd66ff');
    ctx.fillStyle = titleGrad;
    ctx.font = 'bold 52px Fredoka One, cursive';
    ctx.fillText('SPIN CLASH', canvas.width / 2, canvas.height * 0.15);

    // Subtitle
    ctx.fillStyle = '#ccbbff';
    ctx.font = '20px Fredoka One, cursive';
    ctx.fillText('Open World Spinning Top RPG', canvas.width / 2, canvas.height * 0.22);

    // Press start
    const alpha = 0.5 + Math.sin(time / 400) * 0.5;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.font = '22px Fredoka One, cursive';
    ctx.fillText('Press SPACE or TAP to Start', canvas.width / 2, canvas.height * 0.78);

    // Controls info
    ctx.fillStyle = 'rgba(200,200,255,0.6)';
    ctx.font = '14px Nunito, cursive';
    ctx.fillText('Arrow Keys / WASD = Move  |  Z / Space = Action  |  X / Esc = Cancel/Menu', canvas.width / 2, canvas.height * 0.9);

    // Version
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '12px Nunito, cursive';
    ctx.fillText('v1.0 — A Cute Open World Adventure', canvas.width / 2, canvas.height * 0.95);
}

// ══════════════════════════════════════════════════════════════
// WORLD SCREEN
// ══════════════════════════════════════════════════════════════
let inputCooldown = 0;

function updateWorld(dt) {
    const p = GS.player;
    const zone = ZONES[GS.zone];
    const map = zone.map;

    if (inputCooldown > 0) { inputCooldown -= dt; return; }

    // Menu open
    if (cancelJustPressed() && GS.screen === 'world') {
        sfx('menu');
        GS.screen = 'menu';
        GS.menu = { cursor: 0 };
        inputCooldown = 200;
        return;
    }

    // Movement
    let dx = 0, dy = 0;
    if (isDown('up')) { dy = -1; p.dir = 'up'; }
    else if (isDown('down')) { dy = 1; p.dir = 'down'; }
    else if (isDown('left')) { dx = -1; p.dir = 'left'; }
    else if (isDown('right')) { dx = 1; p.dir = 'right'; }

    p.moving = dx !== 0 || dy !== 0;

    if (p.moving && p.stepCooldown <= 0) {
        const nx = p.x + dx * TILE;
        const ny = p.y + dy * TILE;
        const tx = Math.floor(nx / TILE);
        const ty = Math.floor(ny / TILE);
        const tile = getTile(GS.zone, tx, ty);

        if (tile >= 0 && WALKABLE.has(tile)) {
            p.x = nx;
            p.y = ny;
            p.frame++;
            p.stepCooldown = 150;
            sfx('step');

            // Check encounters
            if ((tile === T.TALL_GRASS || tile === T.DARK_GRASS) && GS.team.length > 0) {
                if (Math.random() < ENCOUNTER_CHANCE) {
                    const enc = zone.encounters[tile];
                    if (enc && enc.length > 0) {
                        const wildId = enc[Math.floor(Math.random() * enc.length)];
                        const lvl = zone.wildLevels[0] + Math.floor(Math.random() * (zone.wildLevels[1] - zone.wildLevels[0] + 1));
                        startBattle(createTop(wildId, lvl), true);
                        return;
                    }
                }
            }

            // Check zone exits
            checkZoneExit(tx, ty);

            // Check chests
            if (tile === T.CHEST) {
                const key = `${GS.zone}_${tx}_${ty}`;
                if (!GS.chestsOpened[key]) {
                    GS.chestsOpened[key] = true;
                    const rewards = ['potion', 'super_potion', 'spin_ball', 'great_ball', 'revive'];
                    const item = rewards[Math.floor(Math.random() * rewards.length)];
                    const qty = 1 + Math.floor(Math.random() * 3);
                    GS.bag[item] = (GS.bag[item] || 0) + qty;
                    GS.gold += 100 + Math.floor(Math.random() * 200);
                    addNotification(`Found ${qty}x ${ITEMS[item].name} and some gold! 🎁`);
                    sfx('catch');
                    map[ty][tx] = T.PATH; // chest opened
                }
            }
        } else if (tile === -1) {
            // Edge of map — check exit
            checkZoneExit(tx, ty);
        } else {
            sfx('bump');
        }
    }

    if (p.stepCooldown > 0) p.stepCooldown -= dt;

    // Action button — talk to NPCs
    if (actionJustPressed()) {
        const facingX = Math.floor(p.x / TILE) + (p.dir === 'left' ? -1 : p.dir === 'right' ? 1 : 0);
        const facingY = Math.floor(p.y / TILE) + (p.dir === 'up' ? -1 : p.dir === 'down' ? 1 : 0);

        // Also check current tile for signs
        const currentX = Math.floor(p.x / TILE);
        const currentY = Math.floor(p.y / TILE);

        const npc = NPCS.find(n => n.zone === GS.zone &&
            ((n.x === facingX && n.y === facingY) || (n.x === currentX && n.y === currentY)));
        if (npc) {
            startDialogue(npc);
        }
    }

    // Auto-save periodically
    GS.playTime += dt;
    if (Math.floor(GS.playTime / 30000) !== Math.floor((GS.playTime - dt) / 30000)) {
        saveGame();
    }

    // Check quests
    checkQuests();
}

function checkZoneExit(tx, ty) {
    const zone = ZONES[GS.zone];
    const map = zone.map;
    const w = map[0].length;
    const h = map.length;

    let edge = null;
    if (tx < 0) edge = 'west';
    else if (tx >= w) edge = 'east';
    else if (ty < 0) edge = 'north';
    else if (ty >= h) edge = 'south';

    if (!edge) return;

    const exit = ZONE_EXITS.find(e => e.from === GS.zone && e.edge === edge);
    if (exit) {
        startTransition(() => {
            GS.zone = exit.to;
            GS.player.x = exit.toX * TILE;
            GS.player.y = exit.toY * TILE;
            addNotification(`📍 ${ZONES[exit.to].name}`);
        });
    } else {
        // Bounce back
        GS.player.x = Math.max(0, Math.min((w - 1) * TILE, GS.player.x));
        GS.player.y = Math.max(0, Math.min((h - 1) * TILE, GS.player.y));
    }
}

function drawWorld(time) {
    const zone = ZONES[GS.zone];
    const map = zone.map;
    const p = GS.player;

    // Camera follow player
    GS.cam.x = p.x - canvas.width / 2 + TILE / 2;
    GS.cam.y = p.y - canvas.height / 2 + TILE / 2;

    // Day/night tint
    GS.dayNightCycle += 0.0001;
    const daylight = 0.85 + Math.sin(GS.dayNightCycle) * 0.15;

    ctx.save();
    ctx.translate(-GS.cam.x + GS.shake.x, -GS.cam.y + GS.shake.y);

    // Draw tiles
    const startTX = Math.max(0, Math.floor(GS.cam.x / TILE) - 1);
    const startTY = Math.max(0, Math.floor(GS.cam.y / TILE) - 1);
    const endTX = Math.min(map[0].length, Math.ceil((GS.cam.x + canvas.width) / TILE) + 1);
    const endTY = Math.min(map.length, Math.ceil((GS.cam.y + canvas.height) / TILE) + 1);

    for (let ty = startTY; ty < endTY; ty++) {
        for (let tx = startTX; tx < endTX; tx++) {
            drawTile(map[ty][tx], tx * TILE, ty * TILE, time);
        }
    }

    // Draw NPCs
    NPCS.filter(n => n.zone === GS.zone).forEach(npc => {
        drawNPC(npc, npc.x * TILE, npc.y * TILE, time);
    });

    // Draw player
    drawPlayer(p.x, p.y, p.dir, p.frame, time);

    ctx.restore();

    // HUD
    drawWorldHUD(time);
}

function drawWorldHUD(time) {
    // Zone name
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    drawRoundRect(8, 8, 220, 32, 8, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = '#fff';
    ctx.font = '14px Fredoka One, cursive';
    ctx.textAlign = 'left';
    ctx.fillText(`📍 ${ZONES[GS.zone].name}`, 16, 30);

    // Team preview (top right)
    const teamX = canvas.width - 52 * Math.min(GS.team.length, 6) - 8;
    drawRoundRect(teamX - 4, 4, 52 * Math.min(GS.team.length, 6) + 8, 50, 8, 'rgba(0,0,0,0.5)');
    GS.team.slice(0, 6).forEach((top, i) => {
        const tx = teamX + i * 52 + 26;
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(top.species.emoji, tx, 24);
        // HP bar
        const hpPct = top.hp / top.maxHp;
        const hpColor = hpPct > 0.5 ? '#4d4' : hpPct > 0.2 ? '#dd4' : '#d44';
        drawBar(tx - 16, 35, 32, 6, hpPct, hpColor);
        ctx.fillStyle = '#fff';
        ctx.font = '8px Nunito, cursive';
        ctx.fillText(`Lv${top.level}`, tx, 48);
    });

    // Gold & badges
    drawRoundRect(8, 46, 160, 26, 8, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = '#ffdd44';
    ctx.font = '13px Fredoka One, cursive';
    ctx.textAlign = 'left';
    ctx.fillText(`💰 ${GS.gold}  🏅 ${GS.badges.length}`, 16, 64);

    // Notifications
    GS.notifications = GS.notifications.filter(n => n.time > 0);
    GS.notifications.forEach((n, i) => {
        n.time -= 16;
        const alpha = Math.min(1, n.time / 500);
        const ny = canvas.height - 60 - i * 40;
        drawRoundRect(canvas.width / 2 - 180, ny, 360, 34, 8, `rgba(0,0,0,${0.7 * alpha})`, `rgba(255,255,255,${0.3 * alpha})`);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = '14px Fredoka One, cursive';
        ctx.textAlign = 'center';
        ctx.fillText(n.text, canvas.width / 2, ny + 22);
    });

    // Controls hint
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '11px Nunito, cursive';
    ctx.textAlign = 'right';
    ctx.fillText('X/Esc = Menu', canvas.width - 10, canvas.height - 10);
}

// ══════════════════════════════════════════════════════════════
// DIALOGUE SYSTEM
// ══════════════════════════════════════════════════════════════
function startDialogue(npc) {
    // Check if trainer is defeated
    if (npc.defeated && npc.defeatMsg) {
        GS.dialogue = {
            npc, step: -1, text: npc.defeatMsg, choices: null,
            charIndex: 0, fullText: npc.defeatMsg, typing: true
        };
        GS.screen = 'dialogue';
        sfx('talk');
        inputCooldown = 200;
        return;
    }

    const step = npc.dialogue[0];
    if (!step) return;
    GS.dialogue = {
        npc, step: 0, text: '', choices: step.choices || null,
        charIndex: 0, fullText: step.text, typing: true, choiceCursor: 0
    };
    GS.screen = 'dialogue';
    sfx('talk');
    inputCooldown = 200;
}

function updateDialogue(dt) {
    if (inputCooldown > 0) { inputCooldown -= dt; return; }
    const d = GS.dialogue;
    if (!d) { GS.screen = 'world'; return; }

    // Typing effect
    if (d.typing) {
        d.charIndex += 0.5;
        d.text = d.fullText.substring(0, Math.floor(d.charIndex));
        if (d.charIndex >= d.fullText.length) {
            d.typing = false;
            d.text = d.fullText;
        }
        if (actionJustPressed()) {
            d.charIndex = d.fullText.length;
            d.text = d.fullText;
            d.typing = false;
            inputCooldown = 150;
        }
        return;
    }

    // Handle choices
    if (d.choices) {
        if (isDown('up') || isDown('left')) { d.choiceCursor = 0; sfx('select'); inputCooldown = 150; }
        if (isDown('down') || isDown('right')) { d.choiceCursor = Math.min(d.choices.length - 1, d.choiceCursor + 1); sfx('select'); inputCooldown = 150; }
        if (actionJustPressed()) {
            sfx('confirm');
            const step = d.npc.dialogue[d.step];
            const nextSteps = step.next;
            if (Array.isArray(nextSteps)) {
                const nextStep = nextSteps[d.choiceCursor];
                if (nextStep === null) {
                    GS.screen = 'world';
                    inputCooldown = 200;
                    return;
                }
                advanceDialogue(nextStep);
            }
            inputCooldown = 200;
        }
        return;
    }

    // Advance on action press
    if (actionJustPressed() || cancelJustPressed()) {
        const step = d.step === -1 ? null : d.npc.dialogue[d.step];

        // Handle actions
        if (step && step.action) {
            handleDialogueAction(step);
            return;
        }

        if (step && step.next !== null && step.next !== undefined) {
            advanceDialogue(step.next);
        } else {
            GS.screen = 'world';
            inputCooldown = 200;
        }
    }
}

function advanceDialogue(nextStep) {
    const d = GS.dialogue;
    const step = d.npc.dialogue[nextStep];
    if (!step) {
        GS.screen = 'world';
        inputCooldown = 200;
        return;
    }

    // Check for action before text
    if (step.action) {
        d.step = nextStep;
        d.text = step.text;
        d.fullText = step.text;
        d.charIndex = 0;
        d.typing = true;
        d.choices = step.choices || null;
        d.choiceCursor = 0;

        // If the action should trigger immediately (like shop/battle)
        if (step.action === 'shop' || step.action === 'battle' || step.action === 'choose_starter') {
            d.typing = false;
            d.text = step.text;
            d.charIndex = step.text.length;
        }
    } else {
        d.step = nextStep;
        d.text = '';
        d.fullText = step.text;
        d.charIndex = 0;
        d.typing = true;
        d.choices = step.choices || null;
        d.choiceCursor = 0;
    }
    sfx('talk');
    inputCooldown = 150;
}

function handleDialogueAction(step) {
    const d = GS.dialogue;
    switch (step.action) {
        case 'heal':
            GS.team.forEach(t => {
                t.hp = t.maxHp;
                t.moves.forEach(m => t.movePP[m] = MOVES_DB[m].pp);
            });
            sfx('heal');
            addNotification('✨ All tops healed! ✨');
            GS.screen = 'world';
            inputCooldown = 300;
            saveGame();
            break;

        case 'shop':
            GS.screen = 'shop';
            GS.shop = { items: step.shop, cursor: 0 };
            inputCooldown = 200;
            break;

        case 'choose_starter':
            GS.screen = 'starter_select';
            GS.starterSelect = { cursor: 0, starters: [0, 3, 6] }; // Blaze, Frost, Petal
            inputCooldown = 200;
            break;

        case 'battle':
            if (d.npc.defeated) {
                GS.screen = 'world';
                inputCooldown = 200;
                return;
            }
            const trainerTeam = step.team.map(t => {
                // Refresh HP for trainer battles
                const fresh = createTop(t.speciesId, t.level);
                return fresh;
            });
            startBattle(trainerTeam, false, d.npc, step.badge);
            inputCooldown = 300;
            break;
    }
}

function drawDialogue(time) {
    // Draw world behind
    drawWorld(time);

    const d = GS.dialogue;
    if (!d) return;

    // Dialogue box
    const boxW = Math.min(600, canvas.width - 40);
    const boxH = d.choices ? 120 + d.choices.length * 28 : 100;
    const boxX = (canvas.width - boxW) / 2;
    const boxY = canvas.height - boxH - 20;

    // Speaker name
    drawRoundRect(boxX, boxY - 30, Math.min(200, d.npc.name.length * 14 + 40), 28, 8, 'rgba(60,40,100,0.95)', '#8866cc');
    ctx.fillStyle = '#ffddaa';
    ctx.font = '14px Fredoka One, cursive';
    ctx.textAlign = 'left';
    ctx.fillText(`${d.npc.emoji} ${d.npc.name}`, boxX + 12, boxY - 10);

    // Text box
    drawRoundRect(boxX, boxY, boxW, boxH, 12, 'rgba(20,15,40,0.94)', '#8866cc');

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Fredoka One, cursive';
    ctx.textAlign = 'left';
    const lines = wrapText(d.text, boxW - 40);
    lines.forEach((line, i) => {
        ctx.fillText(line, boxX + 20, boxY + 28 + i * 24);
    });

    // Choices
    if (d.choices && !d.typing) {
        d.choices.forEach((choice, i) => {
            const cy = boxY + 28 + lines.length * 24 + 10 + i * 28;
            if (i === d.choiceCursor) {
                drawRoundRect(boxX + 20, cy - 14, boxW - 40, 26, 6, 'rgba(100,80,180,0.6)');
                ctx.fillStyle = '#ffdd88';
            } else {
                ctx.fillStyle = '#aaaacc';
            }
            ctx.fillText(`${i === d.choiceCursor ? '▶ ' : '  '}${choice}`, boxX + 30, cy + 4);
        });
    }

    // Continue indicator
    if (!d.typing && !d.choices) {
        const blinkAlpha = Math.sin(time / 300) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,255,255,${blinkAlpha})`;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('▼', boxX + boxW - 16, boxY + boxH - 12);
    }
}

function wrapText(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let current = '';
    ctx.font = '16px Fredoka One, cursive';
    words.forEach(word => {
        const test = current ? current + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth) {
            if (current) lines.push(current);
            current = word;
        } else {
            current = test;
        }
    });
    if (current) lines.push(current);
    // Also handle \n
    const result = [];
    lines.forEach(l => result.push(...l.split('\n')));
    return result;
}

// ══════════════════════════════════════════════════════════════
// STARTER SELECT
// ══════════════════════════════════════════════════════════════
function updateStarterSelect(dt) {
    if (inputCooldown > 0) { inputCooldown -= dt; return; }
    const s = GS.starterSelect;

    if (isDown('left')) { s.cursor = Math.max(0, s.cursor - 1); sfx('select'); inputCooldown = 150; }
    if (isDown('right')) { s.cursor = Math.min(2, s.cursor + 1); sfx('select'); inputCooldown = 150; }

    if (actionJustPressed()) {
        sfx('catch');
        const starter = createTop(s.starters[s.cursor], 5);
        GS.team.push(starter);
        addNotification(`You got ${starter.name}! 🎉`);
        GS.screen = 'world';
        inputCooldown = 300;
        saveGame();
    }
    if (cancelJustPressed()) {
        GS.screen = 'world';
        inputCooldown = 200;
    }
}

function drawStarterSelect(time) {
    drawWorld(time);

    // Overlay
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffdd88';
    ctx.font = '28px Fredoka One, cursive';
    ctx.fillText('Choose Your Partner!', canvas.width / 2, 60);

    const s = GS.starterSelect;
    const spacing = Math.min(200, canvas.width / 4);
    const startX = canvas.width / 2 - spacing;

    s.starters.forEach((specId, i) => {
        const sp = SPECIES[specId];
        const cx = startX + i * spacing;
        const cy = canvas.height * 0.4;
        const selected = i === s.cursor;

        // Selection glow
        if (selected) {
            ctx.fillStyle = sp.color + '33';
            ctx.beginPath();
            ctx.arc(cx, cy, 70, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = sp.color;
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        drawSpinningTop(cx, cy, sp, selected ? 45 : 35, time / 400);

        // Name
        ctx.fillStyle = selected ? '#fff' : '#888';
        ctx.font = `${selected ? 22 : 18}px Fredoka One, cursive`;
        ctx.fillText(sp.name, cx, cy + 70);

        // Type
        ctx.fillStyle = TYPE_COLORS[sp.type];
        ctx.font = '14px Fredoka One, cursive';
        ctx.fillText(`${TYPE_EMOJI[sp.type]} ${sp.type.toUpperCase()}`, cx, cy + 92);

        // Stats
        if (selected) {
            ctx.fillStyle = '#ccc';
            ctx.font = '13px Nunito, cursive';
            ctx.fillText(`HP: ${sp.baseHp}  ATK: ${sp.baseAtk}  DEF: ${sp.baseDef}  SPD: ${sp.baseSpd}`, cx, cy + 112);
            ctx.fillStyle = '#aaa';
            ctx.font = '12px Nunito, cursive';
            const descLines = wrapText(sp.desc, 250);
            descLines.forEach((l, li) => ctx.fillText(l, cx, cy + 130 + li * 16));
        }
    });

    // Instructions
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px Nunito, cursive';
    ctx.fillText('← → to choose  |  Z/Space to confirm', canvas.width / 2, canvas.height - 30);
}

// ══════════════════════════════════════════════════════════════
// BATTLE SYSTEM
// ══════════════════════════════════════════════════════════════
function startBattle(opponent, isWild, trainerNpc, badge) {
    sfx('encounter');
    let enemyTeam;
    if (Array.isArray(opponent)) {
        enemyTeam = opponent;
    } else {
        enemyTeam = [opponent];
    }

    GS.battle = {
        phase: 'intro', // intro, choose, animate, enemy_turn, result, catch_anim, xp_gain, switch
        playerTop: GS.team.find(t => t.hp > 0) || GS.team[0],
        enemyTeam,
        enemyIndex: 0,
        enemyTop: enemyTeam[0],
        isWild,
        trainerNpc,
        badge,
        message: isWild ? `A wild ${enemyTeam[0].name} appeared!` : `${trainerNpc.name} wants to battle!`,
        cursor: 0,
        subMenu: null,
        subCursor: 0,
        animTimer: 0,
        shakeEnemy: 0,
        shakePlayer: 0,
        playerDefending: false,
        enemyDefending: false,
        catchAnim: 0,
        catchSuccess: false,
        turnOrder: [],
        xpMessages: [],
        xpMsgIndex: 0,
        introTimer: 0,
        playerStatBoosts: { atk: 0, def: 0, spd: 0 },
        enemyStatBoosts: { atk: 0, def: 0, spd: 0 },
    };
    GS.screen = 'battle';
    inputCooldown = 500;
}

function updateBattle(dt) {
    if (inputCooldown > 0) { inputCooldown -= dt; return; }
    const b = GS.battle;
    if (!b) return;

    switch (b.phase) {
        case 'intro':
            b.introTimer += dt;
            if (b.introTimer > 1500 || actionJustPressed()) {
                b.phase = 'choose';
                b.message = 'What will you do?';
                inputCooldown = 200;
            }
            break;

        case 'choose':
            if (!b.subMenu) {
                // Main menu: Fight, Bag, Team, Run
                if (isDown('up')) { b.cursor = (b.cursor + 3) % 4; sfx('select'); inputCooldown = 150; }
                if (isDown('down')) { b.cursor = (b.cursor + 1) % 4; sfx('select'); inputCooldown = 150; }
                if (isDown('left')) { b.cursor = (b.cursor + 3) % 4; sfx('select'); inputCooldown = 150; }
                if (isDown('right')) { b.cursor = (b.cursor + 1) % 4; sfx('select'); inputCooldown = 150; }

                if (actionJustPressed()) {
                    sfx('confirm');
                    switch (b.cursor) {
                        case 0: // Fight
                            b.subMenu = 'fight';
                            b.subCursor = 0;
                            break;
                        case 1: // Bag
                            b.subMenu = 'bag';
                            b.subCursor = 0;
                            b.bagItems = Object.entries(GS.bag).filter(([k, v]) => v > 0);
                            break;
                        case 2: // Team
                            b.subMenu = 'team';
                            b.subCursor = 0;
                            break;
                        case 3: // Run
                            if (b.isWild) {
                                const runChance = 0.5 + (b.playerTop.spd - b.enemyTop.spd) * 0.02;
                                if (Math.random() < runChance) {
                                    b.message = 'Got away safely!';
                                    b.phase = 'result';
                                    b.resultType = 'run';
                                } else {
                                    b.message = "Can't escape!";
                                    b.phase = 'animate';
                                    b.animTimer = 0;
                                    b.pendingEnemyTurn = true;
                                }
                            } else {
                                b.message = "Can't run from a trainer battle!";
                                b.phase = 'animate';
                                b.animTimer = 0;
                                setTimeout(() => { b.phase = 'choose'; b.message = 'What will you do?'; }, 1200);
                            }
                            break;
                    }
                    inputCooldown = 200;
                }
            } else if (b.subMenu === 'fight') {
                const moves = b.playerTop.moves;
                if (isDown('up')) { b.subCursor = Math.max(0, b.subCursor - 1); sfx('select'); inputCooldown = 150; }
                if (isDown('down')) { b.subCursor = Math.min(moves.length - 1, b.subCursor + 1); sfx('select'); inputCooldown = 150; }
                if (cancelJustPressed()) { b.subMenu = null; sfx('cancel'); inputCooldown = 150; return; }
                if (actionJustPressed()) {
                    const moveKey = moves[b.subCursor];
                    if (b.playerTop.movePP[moveKey] > 0) {
                        executeTurn(moveKey);
                    } else {
                        b.message = 'No PP left for this move!';
                        inputCooldown = 200;
                    }
                }
            } else if (b.subMenu === 'bag') {
                const items = b.bagItems;
                if (items.length === 0) {
                    b.message = 'Bag is empty!';
                    b.subMenu = null;
                    inputCooldown = 200;
                    return;
                }
                if (isDown('up')) { b.subCursor = Math.max(0, b.subCursor - 1); sfx('select'); inputCooldown = 150; }
                if (isDown('down')) { b.subCursor = Math.min(items.length - 1, b.subCursor + 1); sfx('select'); inputCooldown = 150; }
                if (cancelJustPressed()) { b.subMenu = null; sfx('cancel'); inputCooldown = 150; return; }
                if (actionJustPressed()) {
                    const [itemKey, qty] = items[b.subCursor];
                    const item = ITEMS[itemKey];
                    if (item.effect === 'catch') {
                        if (!b.isWild) {
                            b.message = "Can't catch a trainer's top!";
                            inputCooldown = 300;
                            return;
                        }
                        GS.bag[itemKey]--;
                        attemptCatch(item.value);
                    } else if (item.effect === 'heal') {
                        GS.bag[itemKey]--;
                        b.playerTop.hp = Math.min(b.playerTop.maxHp, b.playerTop.hp + item.value);
                        sfx('heal');
                        b.message = `Used ${item.name}! Restored HP!`;
                        b.subMenu = null;
                        b.phase = 'animate';
                        b.animTimer = 0;
                        b.pendingEnemyTurn = true;
                    } else if (item.effect === 'revive') {
                        const fainted = GS.team.find(t => t.hp <= 0);
                        if (fainted) {
                            GS.bag[itemKey]--;
                            fainted.hp = Math.floor(fainted.maxHp * item.value);
                            sfx('heal');
                            b.message = `${fainted.name} was revived!`;
                        } else {
                            b.message = 'No fainted tops to revive!';
                        }
                        b.subMenu = null;
                        inputCooldown = 300;
                    }
                    inputCooldown = 200;
                }
            } else if (b.subMenu === 'team') {
                if (isDown('up')) { b.subCursor = Math.max(0, b.subCursor - 1); sfx('select'); inputCooldown = 150; }
                if (isDown('down')) { b.subCursor = Math.min(GS.team.length - 1, b.subCursor + 1); sfx('select'); inputCooldown = 150; }
                if (cancelJustPressed()) { b.subMenu = null; sfx('cancel'); inputCooldown = 150; return; }
                if (actionJustPressed()) {
                    const chosen = GS.team[b.subCursor];
                    if (chosen.hp <= 0) {
                        b.message = `${chosen.name} has fainted!`;
                    } else if (chosen === b.playerTop) {
                        b.message = `${chosen.name} is already out!`;
                    } else {
                        b.playerTop = chosen;
                        b.message = `Go, ${chosen.name}!`;
                        b.subMenu = null;
                        b.playerStatBoosts = { atk: 0, def: 0, spd: 0 };
                        b.phase = 'animate';
                        b.animTimer = 0;
                        b.pendingEnemyTurn = true;
                    }
                    inputCooldown = 200;
                }
            }
            break;

        case 'animate':
            b.animTimer += dt;
            if (b.animTimer > 1200) {
                if (b.pendingEnemyTurn) {
                    b.pendingEnemyTurn = false;
                    enemyTurn();
                } else if (b.playerTop.hp <= 0) {
                    // Player top fainted
                    const alive = GS.team.find(t => t.hp > 0);
                    if (alive) {
                        b.message = `${b.playerTop.name} fainted! Choose another top!`;
                        b.subMenu = 'team';
                        b.subCursor = 0;
                        b.phase = 'choose';
                    } else {
                        b.message = 'All your tops fainted...';
                        b.phase = 'result';
                        b.resultType = 'lose';
                        sfx('lose');
                    }
                } else if (b.enemyTop.hp <= 0) {
                    // Enemy fainted
                    b.enemyIndex++;
                    if (b.enemyIndex < b.enemyTeam.length) {
                        b.enemyTop = b.enemyTeam[b.enemyIndex];
                        b.enemyStatBoosts = { atk: 0, def: 0, spd: 0 };
                        b.message = b.isWild ? `A wild ${b.enemyTop.name} appeared!` : `${b.trainerNpc.name} sent out ${b.enemyTop.name}!`;
                        b.phase = 'animate';
                        b.animTimer = 0;
                        b.pendingEnemyTurn = false;
                    } else {
                        // Victory!
                        const xpGain = Math.floor(20 + b.enemyTop.level * 8);
                        b.xpMessages = addXP(b.playerTop, xpGain);
                        b.xpMessages.unshift(`${b.playerTop.name} gained ${xpGain} XP!`);
                        // Check evolution flag
                        if (b.xpMessages.some(m => m.includes('evolving'))) {
                            GS.evolved = true;
                            sfx('evolve');
                        } else {
                            sfx('win');
                        }
                        if (b.xpMessages.some(m => m.includes('grew to'))) sfx('levelup');
                        b.phase = 'xp_gain';
                        b.xpMsgIndex = 0;
                        b.resultType = 'win';
                        GS.battleCount++;

                        // Gold reward
                        const goldReward = b.isWild ? 50 + b.enemyTop.level * 5 : 150 + b.enemyTop.level * 15;
                        GS.gold += goldReward;
                        b.xpMessages.push(`Got ${goldReward} gold!`);

                        if (b.badge) {
                            if (!GS.badges.includes(b.badge)) GS.badges.push(b.badge);
                            b.xpMessages.push(`Received: ${b.badge}! 🏅`);
                        }
                        if (b.trainerNpc) {
                            b.trainerNpc.defeated = true;
                            GS.trainersDefeated[b.trainerNpc.name] = true;
                        }
                    }
                } else {
                    b.phase = 'choose';
                    b.message = 'What will you do?';
                    b.subMenu = null;
                    b.playerDefending = false;
                }
                inputCooldown = 200;
            }
            break;

        case 'xp_gain':
            if (actionJustPressed()) {
                b.xpMsgIndex++;
                sfx('select');
                if (b.xpMsgIndex >= b.xpMessages.length) {
                    b.phase = 'result';
                    b.message = b.isWild ? 'Victory!' : `${b.trainerNpc.name}: ${b.trainerNpc.defeatMsg || 'You win!'}`;
                }
                inputCooldown = 200;
            }
            break;

        case 'catch_anim':
            b.catchAnim += dt;
            if (b.catchAnim > 2500) {
                if (b.catchSuccess) {
                    if (GS.team.length < MAX_TEAM_SIZE) {
                        GS.team.push(b.enemyTop);
                        b.enemyTop.caught = true;
                    } else {
                        GS.box.push(b.enemyTop);
                        b.enemyTop.caught = true;
                    }
                    b.message = `Caught ${b.enemyTop.name}! 🎉`;
                    b.phase = 'result';
                    b.resultType = 'catch';
                    sfx('catch');
                } else {
                    b.message = `${b.enemyTop.name} broke free!`;
                    b.phase = 'animate';
                    b.animTimer = 0;
                    b.pendingEnemyTurn = true;
                }
                inputCooldown = 300;
            }
            break;

        case 'result':
            if (actionJustPressed()) {
                sfx('confirm');
                if (b.resultType === 'lose') {
                    // Heal and send back to last town
                    GS.team.forEach(t => {
                        t.hp = Math.floor(t.maxHp * 0.5);
                        t.moves.forEach(m => t.movePP[m] = MOVES_DB[m].pp);
                    });
                    GS.gold = Math.max(0, GS.gold - 100);
                    addNotification('Blacked out! Lost some gold...');
                    // Find nearest heal center zone
                    if ([2, 3, 4, 5, 6, 7].includes(GS.zone)) {
                        GS.player.x = 6 * TILE;
                        GS.player.y = 21 * TILE;
                        GS.zone = 2;
                    } else {
                        GS.player.x = 21 * TILE;
                        GS.player.y = 18 * TILE;
                        GS.zone = 0;
                    }
                }
                GS.screen = 'world';
                GS.battle = null;
                saveGame();
                inputCooldown = 300;
            }
            break;
    }
}

function executeTurn(playerMoveKey) {
    const b = GS.battle;
    const playerMove = MOVES_DB[playerMoveKey];
    b.playerTop.movePP[playerMoveKey]--;
    b.subMenu = null;

    // Determine order
    const pSpd = b.playerTop.spd * (1 + b.playerStatBoosts.spd * 0.25);
    const eSpd = b.enemyTop.spd * (1 + b.enemyStatBoosts.spd * 0.25);

    const playerFirst = pSpd >= eSpd;

    if (playerFirst) {
        executeMove(playerMove, b.playerTop, b.enemyTop, b.playerStatBoosts, b.enemyStatBoosts, true);
        if (b.enemyTop.hp > 0) {
            b.pendingEnemyTurn = true;
        }
    } else {
        enemyTurn();
        if (b.playerTop.hp > 0) {
            setTimeout(() => {
                executeMove(playerMove, b.playerTop, b.enemyTop, b.playerStatBoosts, b.enemyStatBoosts, true);
            }, 600);
        }
    }

    b.phase = 'animate';
    b.animTimer = 0;
    inputCooldown = 300;
}

function executeMove(move, attacker, defender, atkBoosts, defBoosts, isPlayer) {
    const b = GS.battle;

    // Handle effects
    if (move.effect === 'heal_30') {
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.floor(attacker.maxHp * 0.3));
        b.message = `${attacker.name} restored HP!`;
        sfx('heal');
        return;
    }
    if (move.effect === 'heal_60') {
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.floor(attacker.maxHp * 0.6));
        b.message = `${attacker.name} restored lots of HP!`;
        sfx('heal');
        return;
    }
    if (move.effect === 'def_up') {
        atkBoosts.def = Math.min(3, atkBoosts.def + 1);
        b.message = `${attacker.name}'s defense rose!`;
        sfx('confirm');
        if (isPlayer) b.playerDefending = true;
        else b.enemyDefending = true;
        return;
    }
    if (move.effect === 'atk_up') {
        atkBoosts.atk = Math.min(3, atkBoosts.atk + 1);
        b.message = `${attacker.name}'s attack rose!`;
        sfx('confirm');
        return;
    }
    if (move.effect === 'spd_up') {
        atkBoosts.spd = Math.min(3, atkBoosts.spd + 1);
        b.message = `${attacker.name}'s speed rose!`;
        sfx('confirm');
        return;
    }

    // Accuracy check
    if (Math.random() * 100 > move.acc) {
        b.message = `${attacker.name} used ${move.name}... but missed!`;
        sfx('cancel');
        return;
    }

    // Damage calculation
    const atkStat = attacker.atk * (1 + atkBoosts.atk * 0.25);
    const defStat = defender.def * (1 + defBoosts.def * 0.25);
    const stab = move.type === attacker.type ? 1.3 : 1.0;
    const typeEff = typeMultiplier(move.type, defender.type);
    const crit = Math.random() < 0.08 ? 1.5 : 1.0;
    const rand = 0.85 + Math.random() * 0.15;
    const defending = isPlayer ? b.enemyDefending : b.playerDefending;
    const defMult = defending ? 0.5 : 1.0;

    let damage = Math.floor(((2 * attacker.level / 5 + 2) * move.power * atkStat / defStat / 50 + 2) * stab * typeEff * crit * rand * defMult);
    damage = Math.max(1, damage);

    defender.hp = Math.max(0, defender.hp - damage);

    let msg = `${attacker.name} used ${move.name}!`;
    if (typeEff > 1) msg += ' Super effective!';
    if (typeEff < 1) msg += ' Not very effective...';
    if (crit > 1) { msg += ' Critical hit!'; sfx('crit'); }
    else sfx('hit');
    b.message = msg;

    // Shake
    if (isPlayer) {
        b.shakeEnemy = 10;
        screenShake(5);
    } else {
        b.shakePlayer = 10;
        screenShake(5);
    }

    // Particles
    const px = isPlayer ? canvas.width * 0.7 : canvas.width * 0.3;
    const py = canvas.height * 0.35;
    for (let i = 0; i < 8; i++) {
        addParticle(px, py, TYPE_COLORS[move.type], 30);
    }
}

function enemyTurn() {
    const b = GS.battle;
    b.enemyDefending = false;

    // AI: pick best move
    const moves = b.enemyTop.moves.filter(m => b.enemyTop.movePP[m] > 0);
    if (moves.length === 0) {
        b.message = `${b.enemyTop.name} has no moves left!`;
        return;
    }

    let bestMove = moves[0];
    let bestScore = -1;
    moves.forEach(mk => {
        const m = MOVES_DB[mk];
        let score = m.power * typeMultiplier(m.type, b.playerTop.type);
        if (m.effect && m.power === 0) {
            if (m.effect.startsWith('heal') && b.enemyTop.hp < b.enemyTop.maxHp * 0.4) score = 80;
            else if (m.effect === 'atk_up' && b.enemyStatBoosts.atk < 2) score = 40;
            else if (m.effect === 'def_up' && b.enemyStatBoosts.def < 2) score = 35;
            else score = 10;
        }
        if (score > bestScore) { bestScore = score; bestMove = mk; }
    });

    // Small randomness
    if (Math.random() < 0.2) bestMove = moves[Math.floor(Math.random() * moves.length)];

    b.enemyTop.movePP[bestMove]--;
    executeMove(MOVES_DB[bestMove], b.enemyTop, b.playerTop, b.enemyStatBoosts, b.playerStatBoosts, false);
}

function attemptCatch(ballMultiplier) {
    const b = GS.battle;
    const top = b.enemyTop;
    const hpPct = top.hp / top.maxHp;
    const catchRate = (1 - hpPct * 0.7) * ballMultiplier * (top.species.rarity === 'common' ? 1.2 : top.species.rarity === 'uncommon' ? 1.0 : top.species.rarity === 'rare' ? 0.6 : 0.3);

    b.catchSuccess = Math.random() < catchRate;
    b.catchAnim = 0;
    b.phase = 'catch_anim';
    b.subMenu = null;
    b.message = 'Throwing Spin Ball...';
    sfx('select');
    inputCooldown = 300;
}

function drawBattle(time) {
    const b = GS.battle;
    if (!b) return;

    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0, '#2a1a4a');
    bgGrad.addColorStop(0.5, '#3a2a5a');
    bgGrad.addColorStop(1, '#1a1a3a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Arena floor
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.ellipse(canvas.width / 2, canvas.height * 0.55, canvas.width * 0.45, canvas.height * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Battle particles
    for (let i = GS.particles.length - 1; i >= 0; i--) {
        const p = GS.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        const alpha = p.life / p.maxLife;
        ctx.fillStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        if (p.life <= 0) GS.particles.splice(i, 1);
    }

    // Enemy top
    const enemyX = canvas.width * 0.7 + (b.shakeEnemy > 0 ? (Math.random() - 0.5) * b.shakeEnemy : 0);
    const enemyY = canvas.height * 0.3;
    if (b.shakeEnemy > 0) b.shakeEnemy -= 0.5;

    if (b.phase !== 'catch_anim' || b.catchAnim < 500) {
        drawSpinningTop(enemyX, enemyY, b.enemyTop.species, 50, time / 400, b.enemyTop.hp, b.enemyTop.maxHp);
    } else if (b.phase === 'catch_anim') {
        // Ball animation
        const ballPhase = Math.min(1, (b.catchAnim - 500) / 1000);
        ctx.font = '30px sans-serif';
        ctx.textAlign = 'center';
        const ballX = enemyX + Math.sin(b.catchAnim / 200) * 10 * (1 - ballPhase);
        const ballY = enemyY + ballPhase * 30;
        ctx.fillText('🔴', ballX, ballY);
        // Shake ball
        if (b.catchAnim > 1500 && b.catchAnim < 2500) {
            const shk = Math.sin(b.catchAnim / 50) * 8;
            ctx.fillText('🔴', ballX + shk, ballY);
        }
    }

    // Player top
    const playerX = canvas.width * 0.3 + (b.shakePlayer > 0 ? (Math.random() - 0.5) * b.shakePlayer : 0);
    const playerY = canvas.height * 0.55;
    if (b.shakePlayer > 0) b.shakePlayer -= 0.5;
    drawSpinningTop(playerX, playerY, b.playerTop.species, 55, time / 350, b.playerTop.hp, b.playerTop.maxHp);

    // Enemy info box
    drawRoundRect(canvas.width * 0.05, 20, 260, 70, 10, 'rgba(0,0,0,0.7)', '#666');
    ctx.fillStyle = '#fff';
    ctx.font = '16px Fredoka One, cursive';
    ctx.textAlign = 'left';
    ctx.fillText(`${b.enemyTop.species.emoji} ${b.enemyTop.name}  Lv${b.enemyTop.level}`, canvas.width * 0.05 + 12, 44);
    ctx.fillStyle = TYPE_COLORS[b.enemyTop.type];
    ctx.font = '11px Nunito, cursive';
    ctx.fillText(b.enemyTop.type.toUpperCase(), canvas.width * 0.05 + 12, 58);
    const eHpPct = b.enemyTop.hp / b.enemyTop.maxHp;
    drawBar(canvas.width * 0.05 + 12, 64, 200, 10, eHpPct, eHpPct > 0.5 ? '#4d4' : eHpPct > 0.2 ? '#dd4' : '#d44');
    ctx.fillStyle = '#aaa';
    ctx.font = '10px Nunito, cursive';
    ctx.fillText(`${b.enemyTop.hp}/${b.enemyTop.maxHp}`, canvas.width * 0.05 + 218, 74);

    // Player info box
    const piX = canvas.width * 0.55;
    drawRoundRect(piX, canvas.height * 0.62, 280, 80, 10, 'rgba(0,0,0,0.7)', '#666');
    ctx.fillStyle = '#fff';
    ctx.font = '16px Fredoka One, cursive';
    ctx.textAlign = 'left';
    ctx.fillText(`${b.playerTop.species.emoji} ${b.playerTop.name}  Lv${b.playerTop.level}`, piX + 12, canvas.height * 0.62 + 24);
    ctx.fillStyle = TYPE_COLORS[b.playerTop.type];
    ctx.font = '11px Nunito, cursive';
    ctx.fillText(b.playerTop.type.toUpperCase(), piX + 12, canvas.height * 0.62 + 38);
    const pHpPct = b.playerTop.hp / b.playerTop.maxHp;
    drawBar(piX + 12, canvas.height * 0.62 + 44, 220, 12, pHpPct, pHpPct > 0.5 ? '#4d4' : pHpPct > 0.2 ? '#dd4' : '#d44');
    ctx.fillStyle = '#ccc';
    ctx.font = '11px Nunito, cursive';
    ctx.fillText(`HP: ${b.playerTop.hp}/${b.playerTop.maxHp}`, piX + 12, canvas.height * 0.62 + 65);
    // XP bar
    const xpPct = b.playerTop.xp / xpToNext(b.playerTop.level);
    drawBar(piX + 120, canvas.height * 0.62 + 56, 120, 8, xpPct, '#66aaff');
    ctx.fillText(`XP: ${b.playerTop.xp}/${xpToNext(b.playerTop.level)}`, piX + 120, canvas.height * 0.62 + 65);

    // Message box
    const msgY = canvas.height - 160;
    drawRoundRect(20, msgY, canvas.width - 40, 50, 10, 'rgba(0,0,0,0.8)', '#8866cc');
    ctx.fillStyle = '#fff';
    ctx.font = '15px Fredoka One, cursive';
    ctx.textAlign = 'left';
    ctx.fillText(b.message, 36, msgY + 30);

    // XP messages
    if (b.phase === 'xp_gain' && b.xpMessages.length > 0) {
        const msg = b.xpMessages[b.xpMsgIndex] || '';
        drawRoundRect(20, msgY - 50, canvas.width - 40, 44, 10, 'rgba(40,20,80,0.9)', '#ffaa44');
        ctx.fillStyle = '#ffdd88';
        ctx.font = '15px Fredoka One, cursive';
        ctx.fillText(msg, 36, msgY - 24);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '11px Nunito, cursive';
        ctx.textAlign = 'right';
        ctx.fillText(`${b.xpMsgIndex + 1}/${b.xpMessages.length}  [Space]`, canvas.width - 36, msgY - 24);
    }

    // Menu (only during 'choose' phase)
    if (b.phase === 'choose') {
        const menuY = canvas.height - 100;

        if (!b.subMenu) {
            // Main battle menu
            const opts = ['⚔️ Fight', '🎒 Bag', '🔄 Team', '🏃 Run'];
            const menuW = Math.min(400, canvas.width - 40);
            drawRoundRect((canvas.width - menuW) / 2, menuY, menuW, 90, 10, 'rgba(20,15,40,0.95)', '#8866cc');
            opts.forEach((opt, i) => {
                const ox = (canvas.width - menuW) / 2 + 20 + (i % 2) * (menuW / 2 - 10);
                const oy = menuY + 20 + Math.floor(i / 2) * 36;
                if (i === b.cursor) {
                    drawRoundRect(ox - 4, oy - 12, menuW / 2 - 20, 30, 6, 'rgba(100,80,180,0.5)');
                    ctx.fillStyle = '#ffdd88';
                } else {
                    ctx.fillStyle = '#aaaacc';
                }
                ctx.font = '15px Fredoka One, cursive';
                ctx.textAlign = 'left';
                ctx.fillText(opt, ox + 4, oy + 6);
            });
        } else if (b.subMenu === 'fight') {
            // Move list
            const moves = b.playerTop.moves;
            const mw = Math.min(450, canvas.width - 40);
            drawRoundRect((canvas.width - mw) / 2, menuY - 20, mw, 30 + moves.length * 32, 10, 'rgba(20,15,40,0.95)', '#8866cc');
            moves.forEach((mk, i) => {
                const m = MOVES_DB[mk];
                const my = menuY + i * 32;
                if (i === b.subCursor) {
                    drawRoundRect((canvas.width - mw) / 2 + 8, my - 8, mw - 16, 28, 6, 'rgba(100,80,180,0.5)');
                    ctx.fillStyle = '#ffdd88';
                } else {
                    ctx.fillStyle = '#aaaacc';
                }
                ctx.font = '14px Fredoka One, cursive';
                ctx.textAlign = 'left';
                ctx.fillText(`${TYPE_EMOJI[m.type]} ${m.name}`, (canvas.width - mw) / 2 + 20, my + 10);
                ctx.fillStyle = TYPE_COLORS[m.type];
                ctx.font = '11px Nunito, cursive';
                const ppLeft = b.playerTop.movePP[mk];
                ctx.fillText(`PWR:${m.power || '--'}  PP:${ppLeft}/${m.pp}`, (canvas.width - mw) / 2 + mw - 150, my + 10);
            });
        } else if (b.subMenu === 'bag') {
            const items = b.bagItems;
            const bw = Math.min(350, canvas.width - 40);
            drawRoundRect((canvas.width - bw) / 2, menuY - 20, bw, 30 + Math.max(1, items.length) * 30, 10, 'rgba(20,15,40,0.95)', '#8866cc');
            if (items.length === 0) {
                ctx.fillStyle = '#aaa';
                ctx.font = '14px Fredoka One, cursive';
                ctx.textAlign = 'center';
                ctx.fillText('Bag is empty!', canvas.width / 2, menuY + 10);
            }
            items.forEach(([key, qty], i) => {
                const item = ITEMS[key];
                const iy = menuY + i * 30;
                if (i === b.subCursor) {
                    drawRoundRect((canvas.width - bw) / 2 + 8, iy - 8, bw - 16, 26, 6, 'rgba(100,80,180,0.5)');
                    ctx.fillStyle = '#ffdd88';
                } else {
                    ctx.fillStyle = '#aaaacc';
                }
                ctx.font = '14px Fredoka One, cursive';
                ctx.textAlign = 'left';
                ctx.fillText(`${item.emoji} ${item.name} x${qty}`, (canvas.width - bw) / 2 + 20, iy + 10);
            });
        } else if (b.subMenu === 'team') {
            drawTeamList(menuY);
        }
    }

    // Result overlay
    if (b.phase === 'result') {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';
        ctx.font = '32px Fredoka One, cursive';
        if (b.resultType === 'win' || b.resultType === 'catch') {
            ctx.fillStyle = '#ffdd44';
            ctx.fillText(b.resultType === 'catch' ? '🎉 Caught! 🎉' : '🏆 Victory! 🏆', canvas.width / 2, canvas.height * 0.35);
        } else if (b.resultType === 'lose') {
            ctx.fillStyle = '#ff6644';
            ctx.fillText('💫 Defeated... 💫', canvas.width / 2, canvas.height * 0.35);
        } else {
            ctx.fillStyle = '#aaddff';
            ctx.fillText('🏃 Escaped!', canvas.width / 2, canvas.height * 0.35);
        }
        ctx.fillStyle = '#ccc';
        ctx.font = '16px Fredoka One, cursive';
        ctx.fillText(b.message, canvas.width / 2, canvas.height * 0.45);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '14px Nunito, cursive';
        ctx.fillText('Press Space to continue', canvas.width / 2, canvas.height * 0.55);
    }

    // Wild indicator
    if (b.isWild && b.phase === 'choose') {
        ctx.fillStyle = 'rgba(255,255,100,0.7)';
        ctx.font = '12px Nunito, cursive';
        ctx.textAlign = 'left';
        ctx.fillText('🌿 WILD', canvas.width * 0.05 + 12, 16);
    }
}

function drawTeamList(menuY) {
    const b = GS.battle;
    const tw = Math.min(400, canvas.width - 40);
    drawRoundRect((canvas.width - tw) / 2, menuY - 40, tw, 30 + GS.team.length * 34, 10, 'rgba(20,15,40,0.95)', '#8866cc');
    GS.team.forEach((top, i) => {
        const ty = menuY - 20 + i * 34;
        if (i === b.subCursor) {
            drawRoundRect((canvas.width - tw) / 2 + 8, ty - 10, tw - 16, 30, 6, 'rgba(100,80,180,0.5)');
            ctx.fillStyle = top.hp > 0 ? '#ffdd88' : '#884444';
        } else {
            ctx.fillStyle = top.hp > 0 ? '#aaaacc' : '#666666';
        }
        ctx.font = '14px Fredoka One, cursive';
        ctx.textAlign = 'left';
        ctx.fillText(`${top.species.emoji} ${top.name} Lv${top.level}`, (canvas.width - tw) / 2 + 20, ty + 8);
        const hpPct = top.hp / top.maxHp;
        drawBar((canvas.width - tw) / 2 + tw - 120, ty - 2, 80, 8, hpPct, hpPct > 0.5 ? '#4d4' : hpPct > 0.2 ? '#dd4' : '#d44');
        ctx.fillStyle = '#999';
        ctx.font = '10px Nunito, cursive';
        ctx.fillText(`${top.hp}/${top.maxHp}`, (canvas.width - tw) / 2 + tw - 34, ty + 8);
    });
}

// ══════════════════════════════════════════════════════════════
// MENU SYSTEM
// ══════════════════════════════════════════════════════════════
const MENU_ITEMS = ['Team', 'Bag', 'Quests', 'Save', 'Close'];

function updateMenu(dt) {
    if (inputCooldown > 0) { inputCooldown -= dt; return; }

    if (cancelJustPressed()) {
        GS.screen = 'world';
        sfx('cancel');
        inputCooldown = 200;
        return;
    }

    if (isDown('up')) { GS.menu.cursor = Math.max(0, GS.menu.cursor - 1); sfx('select'); inputCooldown = 150; }
    if (isDown('down')) { GS.menu.cursor = Math.min(MENU_ITEMS.length - 1, GS.menu.cursor + 1); sfx('select'); inputCooldown = 150; }

    if (actionJustPressed()) {
        sfx('confirm');
        switch (MENU_ITEMS[GS.menu.cursor]) {
            case 'Team':
                GS.screen = 'team_view';
                GS.teamView = { cursor: 0 };
                break;
            case 'Bag':
                GS.screen = 'bag';
                GS.bagView = { cursor: 0, items: Object.entries(GS.bag).filter(([k, v]) => v > 0) };
                break;
            case 'Quests':
                GS.screen = 'quests';
                GS.questView = { cursor: 0 };
                break;
            case 'Save':
                saveGame();
                addNotification('💾 Game saved!');
                sfx('confirm');
                GS.screen = 'world';
                break;
            case 'Close':
                GS.screen = 'world';
                break;
        }
        inputCooldown = 200;
    }
}

function drawMenu(time) {
    drawWorld(time);

    // Dim overlay
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const mw = 200;
    const mh = MENU_ITEMS.length * 38 + 20;
    const mx = canvas.width - mw - 20;
    const my = 20;

    drawRoundRect(mx, my, mw, mh, 12, 'rgba(20,15,40,0.95)', '#8866cc');

    MENU_ITEMS.forEach((item, i) => {
        const iy = my + 16 + i * 38;
        if (i === GS.menu.cursor) {
            drawRoundRect(mx + 8, iy - 8, mw - 16, 32, 6, 'rgba(100,80,180,0.5)');
            ctx.fillStyle = '#ffdd88';
        } else {
            ctx.fillStyle = '#ccccdd';
        }
        ctx.font = '16px Fredoka One, cursive';
        ctx.textAlign = 'left';
        ctx.fillText(`${i === GS.menu.cursor ? '▶ ' : '  '}${item}`, mx + 16, iy + 12);
    });

    // Player info card
    drawRoundRect(20, 20, 220, 120, 12, 'rgba(20,15,40,0.95)', '#666');
    ctx.fillStyle = '#fff';
    ctx.font = '16px Fredoka One, cursive';
    ctx.textAlign = 'left';
    ctx.fillText('🎮 Spinner', 36, 44);
    ctx.fillStyle = '#ffdd44';
    ctx.font = '13px Nunito, cursive';
    ctx.fillText(`💰 Gold: ${GS.gold}`, 36, 65);
    ctx.fillText(`🏅 Badges: ${GS.badges.length}`, 36, 82);
    ctx.fillText(`⚔️ Battles: ${GS.battleCount}`, 36, 99);
    ctx.fillText(`📍 ${ZONES[GS.zone].name}`, 36, 116);
    const hrs = Math.floor(GS.playTime / 3600000);
    const mins = Math.floor((GS.playTime % 3600000) / 60000);
    ctx.fillText(`⏱️ ${hrs}h ${mins}m`, 36, 133);
}

// ── Team View ────────────────────────────────────────────────
function updateTeamView(dt) {
    if (inputCooldown > 0) { inputCooldown -= dt; return; }
    if (cancelJustPressed()) {
        GS.screen = 'menu';
        sfx('cancel');
        inputCooldown = 200;
        return;
    }
    if (isDown('up')) { GS.teamView.cursor = Math.max(0, GS.teamView.cursor - 1); sfx('select'); inputCooldown = 150; }
    if (isDown('down')) { GS.teamView.cursor = Math.min(GS.team.length - 1, GS.teamView.cursor + 1); sfx('select'); inputCooldown = 150; }

    // Use item on team member
    if (actionJustPressed() && GS.teamView.useItem) {
        const top = GS.team[GS.teamView.cursor];
        const item = ITEMS[GS.teamView.useItem];
        if (item.effect === 'heal') {
            if (top.hp < top.maxHp && top.hp > 0) {
                GS.bag[GS.teamView.useItem]--;
                top.hp = Math.min(top.maxHp, top.hp + item.value);
                sfx('heal');
                addNotification(`${top.name} recovered HP!`);
            }
        } else if (item.effect === 'revive') {
            if (top.hp <= 0) {
                GS.bag[GS.teamView.useItem]--;
                top.hp = Math.floor(top.maxHp * item.value);
                sfx('heal');
                addNotification(`${top.name} was revived!`);
            }
        } else if (item.effect === 'stat_atk') {
            GS.bag[GS.teamView.useItem]--;
            top.atk += item.value;
            sfx('levelup');
            addNotification(`${top.name}'s ATK increased!`);
        } else if (item.effect === 'stat_def') {
            GS.bag[GS.teamView.useItem]--;
            top.def += item.value;
            sfx('levelup');
            addNotification(`${top.name}'s DEF increased!`);
        } else if (item.effect === 'stat_spd') {
            GS.bag[GS.teamView.useItem]--;
            top.spd += item.value;
            sfx('levelup');
            addNotification(`${top.name}'s SPD increased!`);
        }
        GS.teamView.useItem = null;
        GS.screen = 'menu';
        inputCooldown = 200;
        saveGame();
    }
}

function drawTeamView(time) {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffdd88';
    ctx.font = '24px Fredoka One, cursive';
    ctx.fillText('My Team', canvas.width / 2, 36);

    GS.team.forEach((top, i) => {
        const ty = 56 + i * 80;
        const selected = i === GS.teamView.cursor;

        drawRoundRect(20, ty, canvas.width - 40, 72, 10,
            selected ? 'rgba(60,40,100,0.8)' : 'rgba(30,25,50,0.8)',
            selected ? '#aa88dd' : '#444');

        // Spinning top preview
        drawSpinningTop(70, ty + 36, top.species, 24, time / 400, top.hp, top.maxHp);

        // Info
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff';
        ctx.font = '16px Fredoka One, cursive';
        ctx.fillText(`${top.name}`, 110, ty + 22);
        ctx.fillStyle = TYPE_COLORS[top.type];
        ctx.font = '12px Nunito, cursive';
        ctx.fillText(`${TYPE_EMOJI[top.type]} ${top.type.toUpperCase()}  Lv${top.level}`, 110, ty + 38);

        // HP bar
        const hpPct = top.hp / top.maxHp;
        drawBar(110, ty + 46, 120, 8, hpPct, hpPct > 0.5 ? '#4d4' : hpPct > 0.2 ? '#dd4' : '#d44');
        ctx.fillStyle = '#aaa';
        ctx.font = '10px Nunito, cursive';
        ctx.fillText(`${top.hp}/${top.maxHp}`, 236, ty + 55);

        // Stats
        if (selected) {
            ctx.fillStyle = '#ccc';
            ctx.font = '12px Nunito, cursive';
            const sx = canvas.width - 220;
            ctx.fillText(`ATK: ${top.atk}`, sx, ty + 20);
            ctx.fillText(`DEF: ${top.def}`, sx, ty + 34);
            ctx.fillText(`SPD: ${top.spd}`, sx, ty + 48);
            ctx.fillText(`XP: ${top.xp}/${xpToNext(top.level)}`, sx, ty + 62);
        }
    });

    // Back hint
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '12px Nunito, cursive';
    ctx.textAlign = 'center';
    ctx.fillText('X/Esc to go back', canvas.width / 2, canvas.height - 16);
}

// ── Bag View ─────────────────────────────────────────────────
function updateBag(dt) {
    if (inputCooldown > 0) { inputCooldown -= dt; return; }
    const bv = GS.bagView;
    bv.items = Object.entries(GS.bag).filter(([k, v]) => v > 0);

    if (cancelJustPressed()) { GS.screen = 'menu'; sfx('cancel'); inputCooldown = 200; return; }
    if (bv.items.length === 0) return;
    if (isDown('up')) { bv.cursor = Math.max(0, bv.cursor - 1); sfx('select'); inputCooldown = 150; }
    if (isDown('down')) { bv.cursor = Math.min(bv.items.length - 1, bv.cursor + 1); sfx('select'); inputCooldown = 150; }

    if (actionJustPressed()) {
        const [key] = bv.items[bv.cursor];
        const item = ITEMS[key];
        if (item && (item.effect === 'heal' || item.effect === 'revive' || item.effect.startsWith('stat_'))) {
            GS.screen = 'team_view';
            GS.teamView = { cursor: 0, useItem: key };
            sfx('confirm');
        }
        inputCooldown = 200;
    }
}

function drawBag(time) {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffdd88';
    ctx.font = '24px Fredoka One, cursive';
    ctx.fillText('🎒 Bag', canvas.width / 2, 36);

    ctx.fillStyle = '#ffdd44';
    ctx.font = '14px Nunito, cursive';
    ctx.fillText(`💰 ${GS.gold} Gold`, canvas.width / 2, 56);

    const bv = GS.bagView;
    if (bv.items.length === 0) {
        ctx.fillStyle = '#888';
        ctx.font = '16px Fredoka One, cursive';
        ctx.fillText('Your bag is empty!', canvas.width / 2, canvas.height / 2);
        return;
    }

    bv.items.forEach(([key, qty], i) => {
        const item = ITEMS[key];
        if (!item) return;
        const iy = 70 + i * 50;
        const selected = i === bv.cursor;

        drawRoundRect(30, iy, canvas.width - 60, 44, 8,
            selected ? 'rgba(60,40,100,0.8)' : 'rgba(30,25,50,0.8)',
            selected ? '#aa88dd' : '#444');

        ctx.textAlign = 'left';
        ctx.fillStyle = selected ? '#ffdd88' : '#ccc';
        ctx.font = '15px Fredoka One, cursive';
        ctx.fillText(`${item.emoji} ${item.name}  x${qty}`, 50, iy + 20);
        ctx.fillStyle = '#999';
        ctx.font = '11px Nunito, cursive';
        ctx.fillText(item.desc, 50, iy + 36);
        ctx.textAlign = 'right';
        ctx.fillText(`${item.price}g`, canvas.width - 50, iy + 20);
    });

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '12px Nunito, cursive';
    ctx.textAlign = 'center';
    ctx.fillText('Z = Use  |  X = Back', canvas.width / 2, canvas.height - 16);
}

// ── Quest View ───────────────────────────────────────────────
function updateQuests(dt) {
    if (inputCooldown > 0) { inputCooldown -= dt; return; }
    if (cancelJustPressed()) { GS.screen = 'menu'; sfx('cancel'); inputCooldown = 200; return; }
}

function drawQuests(time) {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffdd88';
    ctx.font = '24px Fredoka One, cursive';
    ctx.fillText('📜 Quests', canvas.width / 2, 36);

    QUESTS.forEach((q, i) => {
        const qy = 56 + i * 48;
        const done = GS.questsDone.includes(q.id);
        const active = !done && q.check(GS);

        drawRoundRect(30, qy, canvas.width - 60, 42, 8,
            done ? 'rgba(40,80,40,0.6)' : active ? 'rgba(80,60,40,0.6)' : 'rgba(30,25,50,0.6)',
            done ? '#4a4' : active ? '#da4' : '#444');

        ctx.textAlign = 'left';
        ctx.fillStyle = done ? '#8d8' : active ? '#fda' : '#aaa';
        ctx.font = '14px Fredoka One, cursive';
        ctx.fillText(`${done ? '✅' : active ? '⭐' : '⬜'} ${q.name}`, 46, qy + 18);
        ctx.fillStyle = done ? '#6a6' : '#999';
        ctx.font = '11px Nunito, cursive';
        ctx.fillText(q.desc, 46, qy + 34);

        if (active) {
            ctx.fillStyle = '#ffaa44';
            ctx.textAlign = 'right';
            ctx.font = '11px Fredoka One, cursive';
            ctx.fillText('READY!', canvas.width - 46, qy + 18);
        }
    });

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '12px Nunito, cursive';
    ctx.textAlign = 'center';
    ctx.fillText('X/Esc to go back', canvas.width / 2, canvas.height - 16);
}

function checkQuests() {
    QUESTS.forEach(q => {
        if (!GS.questsDone.includes(q.id) && q.check(GS)) {
            GS.questsDone.push(q.id);
            GS.gold += q.reward.gold || 0;
            if (q.reward.item) {
                GS.bag[q.reward.item.id] = (GS.bag[q.reward.item.id] || 0) + q.reward.item.qty;
            }
            addNotification(`✅ Quest Complete: ${q.name}!`);
            sfx('catch');
        }
    });
}

// ══════════════════════════════════════════════════════════════
// SHOP SYSTEM
// ══════════════════════════════════════════════════════════════
function updateShop(dt) {
    if (inputCooldown > 0) { inputCooldown -= dt; return; }
    const s = GS.shop;
    if (!s) { GS.screen = 'world'; return; }

    if (cancelJustPressed()) {
        GS.screen = 'world';
        GS.shop = null;
        sfx('cancel');
        inputCooldown = 200;
        return;
    }

    if (isDown('up')) { s.cursor = Math.max(0, s.cursor - 1); sfx('select'); inputCooldown = 150; }
    if (isDown('down')) { s.cursor = Math.min(s.items.length - 1, s.cursor + 1); sfx('select'); inputCooldown = 150; }

    if (actionJustPressed()) {
        const itemKey = s.items[s.cursor];
        const item = ITEMS[itemKey];
        if (GS.gold >= item.price) {
            GS.gold -= item.price;
            GS.bag[itemKey] = (GS.bag[itemKey] || 0) + 1;
            sfx('buy');
            addNotification(`Bought ${item.name}!`);
            saveGame();
        } else {
            sfx('bump');
            addNotification("Not enough gold!");
        }
        inputCooldown = 200;
    }
}

function drawShop(time) {
    drawWorld(time);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const s = GS.shop;
    const sw = Math.min(400, canvas.width - 40);
    const sh = s.items.length * 52 + 60;
    const sx = (canvas.width - sw) / 2;
    const sy = (canvas.height - sh) / 2;

    drawRoundRect(sx, sy, sw, sh, 12, 'rgba(20,15,40,0.95)', '#ffaa44');

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffdd88';
    ctx.font = '20px Fredoka One, cursive';
    ctx.fillText('🏪 Shop', canvas.width / 2, sy + 28);
    ctx.fillStyle = '#ffdd44';
    ctx.font = '13px Nunito, cursive';
    ctx.fillText(`Your gold: 💰 ${GS.gold}`, canvas.width / 2, sy + 48);

    s.items.forEach((key, i) => {
        const item = ITEMS[key];
        const iy = sy + 58 + i * 52;
        const selected = i === s.cursor;
        const canAfford = GS.gold >= item.price;

        drawRoundRect(sx + 10, iy, sw - 20, 46, 8,
            selected ? 'rgba(100,80,180,0.5)' : 'rgba(40,30,60,0.5)',
            selected ? '#aa88dd' : '#555');

        ctx.textAlign = 'left';
        ctx.fillStyle = selected ? (canAfford ? '#ffdd88' : '#ff8888') : '#aaa';
        ctx.font = '15px Fredoka One, cursive';
        ctx.fillText(`${item.emoji} ${item.name}`, sx + 24, iy + 20);
        ctx.fillStyle = '#999';
        ctx.font = '11px Nunito, cursive';
        ctx.fillText(item.desc, sx + 24, iy + 36);
        ctx.textAlign = 'right';
        ctx.fillStyle = canAfford ? '#ffdd44' : '#ff6644';
        ctx.font = '14px Fredoka One, cursive';
        ctx.fillText(`💰 ${item.price}`, sx + sw - 24, iy + 20);

        // Show owned count
        const owned = GS.bag[key] || 0;
        ctx.fillStyle = '#888';
        ctx.font = '10px Nunito, cursive';
        ctx.fillText(`owned: ${owned}`, sx + sw - 24, iy + 36);
    });

    // Notifications
    GS.notifications.forEach((n, i) => {
        n.time -= 16;
        const alpha = Math.min(1, n.time / 500);
        const ny = canvas.height - 60 - i * 40;
        drawRoundRect(canvas.width / 2 - 140, ny, 280, 34, 8, `rgba(0,0,0,${0.7 * alpha})`);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = '13px Fredoka One, cursive';
        ctx.textAlign = 'center';
        ctx.fillText(n.text, canvas.width / 2, ny + 22);
    });

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '12px Nunito, cursive';
    ctx.textAlign = 'center';
    ctx.fillText('Z = Buy  |  X = Leave', canvas.width / 2, sy + sh + 20);
}

// ══════════════════════════════════════════════════════════════
// MAIN GAME LOOP
// ══════════════════════════════════════════════════════════════
let lastTime = 0;

function gameLoop(timestamp) {
    const dt = Math.min(50, timestamp - lastTime);
    lastTime = timestamp;
    const time = timestamp;

    // Screen shake decay
    if (GS.shake.intensity > 0) {
        GS.shake.x = (Math.random() - 0.5) * GS.shake.intensity;
        GS.shake.y = (Math.random() - 0.5) * GS.shake.intensity;
        GS.shake.intensity *= 0.9;
        if (GS.shake.intensity < 0.5) { GS.shake.intensity = 0; GS.shake.x = 0; GS.shake.y = 0; }
    }

    // Transition
    if (GS.transition.active) {
        if (GS.transition.phase === 'out') {
            GS.transition.alpha += 0.04;
            if (GS.transition.alpha >= 1) {
                GS.transition.phase = 'in';
                if (GS.transition.callback) GS.transition.callback();
            }
        } else {
            GS.transition.alpha -= 0.04;
            if (GS.transition.alpha <= 0) {
                GS.transition.active = false;
                GS.transition.alpha = 0;
            }
        }
    }

    // Clear
    ctx.fillStyle = '#0f0e1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Update + Draw per screen
    switch (GS.screen) {
        case 'title':
            updateTitle();
            drawTitle(time);
            break;
        case 'world':
            updateWorld(dt);
            drawWorld(time);
            break;
        case 'dialogue':
            updateDialogue(dt);
            drawDialogue(time);
            break;
        case 'battle':
            updateBattle(dt);
            drawBattle(time);
            break;
        case 'menu':
            updateMenu(dt);
            drawMenu(time);
            break;
        case 'team_view':
            updateTeamView(dt);
            drawTeamView(time);
            break;
        case 'bag':
            updateBag(dt);
            drawBag(time);
            break;
        case 'quests':
            updateQuests(dt);
            drawQuests(time);
            break;
        case 'shop':
            updateShop(dt);
            drawShop(time);
            break;
        case 'starter_select':
            updateStarterSelect(dt);
            drawStarterSelect(time);
            break;
    }

    // Transition overlay
    if (GS.transition.active) {
        ctx.fillStyle = `rgba(0,0,0,${GS.transition.alpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Update input state tracking
    lastAction = actionPressed();
    lastCancel = cancelPressed();

    requestAnimationFrame(gameLoop);
}

// Start!
requestAnimationFrame(gameLoop);
