// ============================================================
// DIGISPIN — Digital Creatures Open World RPG
// Original digital creatures with evolution chains,
// Supabase auth + cloud saves, cute graphics
// ============================================================

// ── Supabase Setup ──────────────────────────────────────────
const SUPABASE_URL = 'https://wamxqpuoaslwucytrpyn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhbXhxcHVvYXNsd3VjeXRycHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NzIwMTMsImV4cCI6MjA4NzM0ODAxM30.fphgzXFOKEukvUVwzXnC3uXKiTExm7o--I8S6_ioFac';

let supabase = null;
let currentUser = null;
let isGuest = false;

try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
} catch (e) {
    console.warn('Supabase not available, using local saves only');
}

// ── Auth UI ─────────────────────────────────────────────────
const authScreen = document.getElementById('authScreen');
const gameCanvas = document.getElementById('gameCanvas');
const mobileControls = document.getElementById('mobileControls');
const authMsg = document.getElementById('authMsg');

function showAuth() {
    authScreen.classList.remove('hidden');
    gameCanvas.classList.add('hidden');
    mobileControls.classList.add('hidden');
}

function showGame() {
    authScreen.classList.add('hidden');
    gameCanvas.classList.remove('hidden');
    mobileControls.classList.remove('hidden');
}

document.getElementById('btnLogin')?.addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value.trim();
    const pass = document.getElementById('authPassword').value;
    if (!email || !pass) { showAuthMsg('Enter email and password', false); return; }
    showAuthMsg('Logging in...', true);
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        currentUser = data.user;
        isGuest = false;
        showAuthMsg('Welcome back!', true);
        setTimeout(async () => { await loadCloudSave(); showGame(); startGameIfNeeded(); }, 500);
    } catch (e) { showAuthMsg(e.message || 'Login failed', false); }
});

document.getElementById('btnSignup')?.addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value.trim();
    const pass = document.getElementById('authPassword').value;
    if (!email || !pass) { showAuthMsg('Enter email and password', false); return; }
    if (pass.length < 6) { showAuthMsg('Password must be at least 6 characters', false); return; }
    showAuthMsg('Creating account...', true);
    try {
        const { data, error } = await supabase.auth.signUp({ email, password: pass });
        if (error) throw error;
        currentUser = data.user;
        isGuest = false;
        showAuthMsg('Account created! Starting game...', true);
        setTimeout(() => { showGame(); startGameIfNeeded(); }, 800);
    } catch (e) { showAuthMsg(e.message || 'Signup failed', false); }
});

document.getElementById('btnGuest')?.addEventListener('click', () => {
    isGuest = true;
    currentUser = null;
    showAuthMsg('Playing as guest (local save only)', true);
    const loaded = loadLocalSave();
    setTimeout(() => { showGame(); startGameIfNeeded(); }, 400);
});

function showAuthMsg(msg, ok) {
    authMsg.textContent = msg;
    authMsg.className = 'auth-msg' + (ok ? ' success' : '');
}

// Check existing session
(async function initAuth() {
    if (!supabase) { showAuth(); return; }
    try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) {
            currentUser = data.session.user;
            isGuest = false;
            await loadCloudSave();
            showGame();
            startGameIfNeeded();
            return;
        }
    } catch (e) {}
    showAuth();
})();

// ── Cloud Save/Load ─────────────────────────────────────────
async function saveToCloud() {
    if (isGuest || !currentUser || !supabase) return;
    try {
        const saveData = getSaveData();
        const { error } = await supabase.from('save_games').upsert({
            user_id: currentUser.id,
            save_data: saveData,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        if (error) console.warn('Cloud save failed:', error.message);
    } catch (e) { console.warn('Cloud save error:', e); }
}

async function loadCloudSave() {
    if (isGuest || !currentUser || !supabase) return false;
    try {
        const { data, error } = await supabase.from('save_games')
            .select('save_data').eq('user_id', currentUser.id).single();
        if (error || !data) { loadLocalSave(); return false; }
        applySaveData(data.save_data);
        return true;
    } catch (e) { loadLocalSave(); return false; }
}

function saveGame() {
    try {
        localStorage.setItem('digispin_save', JSON.stringify(getSaveData()));
    } catch (e) {}
    saveToCloud();
}

function loadLocalSave() {
    try {
        const raw = localStorage.getItem('digispin_save');
        if (!raw) return false;
        applySaveData(JSON.parse(raw));
        return true;
    } catch (e) { return false; }
}

function getSaveData() {
    return {
        player: GS.player, zone: GS.zone, team: GS.team, box: GS.box,
        bag: GS.bag, gold: GS.gold, badges: GS.badges, questsDone: GS.questsDone,
        flags: GS.flags, evolved: GS.evolved, chestsOpened: GS.chestsOpened,
        trainersDefeated: GS.trainersDefeated, battleCount: GS.battleCount,
        playTime: GS.playTime
    };
}

function applySaveData(save) {
    if (!save) return;
    Object.assign(GS, save);
    GS.team.forEach(t => { t.species = SPECIES[t.speciesId]; });
    GS.box.forEach(t => { t.species = SPECIES[t.speciesId]; });
}

// ── Canvas Setup ────────────────────────────────────────────
const canvas = gameCanvas;
const ctx = canvas.getContext('2d');
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);
resize();

// ── Constants ───────────────────────────────────────────────
const TILE = 48;
const MOVE_SPEED = 3;
const ENCOUNTER_CHANCE = 0.08;
const MAX_TEAM_SIZE = 6;
const MAX_LEVEL = 50;

// ── Sound System ────────────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function ensureAudio() { if (!audioCtx) audioCtx = new AudioCtx(); }
function playTone(freq, dur, type = 'square', vol = 0.06) {
    try {
        ensureAudio();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.value = vol;
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(); o.stop(audioCtx.currentTime + dur);
    } catch (e) {}
}
function sfx(name) {
    const S = {
        step: () => playTone(200, 0.05, 'sine', 0.02),
        bump: () => playTone(100, 0.1, 'square', 0.04),
        talk: () => playTone(400 + Math.random() * 200, 0.06, 'square', 0.03),
        select: () => playTone(600, 0.08, 'sine', 0.05),
        confirm: () => { playTone(500, 0.08, 'sine', 0.05); setTimeout(() => playTone(700, 0.1, 'sine', 0.05), 80); },
        cancel: () => playTone(300, 0.1, 'square', 0.04),
        hit: () => playTone(150, 0.15, 'sawtooth', 0.05),
        crit: () => { playTone(800, 0.05, 'square', 0.05); setTimeout(() => playTone(400, 0.2, 'sawtooth', 0.05), 50); },
        heal: () => { playTone(400, 0.1, 'sine', 0.04); setTimeout(() => playTone(500, 0.1, 'sine', 0.04), 100); setTimeout(() => playTone(650, 0.15, 'sine', 0.04), 200); },
        levelup: () => [0,100,200,300].forEach((d,i) => setTimeout(() => playTone(400+i*100, 0.15, 'sine', 0.05), d)),
        catch: () => [0,80,160,240,320].forEach((d,i) => setTimeout(() => playTone(300+i*80, 0.1, 'sine', 0.05), d)),
        encounter: () => { playTone(300, 0.1, 'square', 0.05); setTimeout(() => playTone(450, 0.1, 'square', 0.05), 100); setTimeout(() => playTone(600, 0.2, 'square', 0.05), 200); },
        win: () => [0,120,240,360,480].forEach((d,i) => setTimeout(() => playTone(400+i*60, 0.2, 'sine', 0.06), d)),
        lose: () => [0,150,300].forEach((d,i) => setTimeout(() => playTone(400-i*80, 0.25, 'sine', 0.05), d)),
        menu: () => playTone(520, 0.06, 'sine', 0.04),
        evolve: () => { for (let i = 0; i < 10; i++) setTimeout(() => playTone(300+i*50, 0.12, 'sine', 0.06), i*80); },
        buy: () => { playTone(600, 0.06, 'sine', 0.04); setTimeout(() => playTone(800, 0.12, 'sine', 0.04), 80); },
        digivolve: () => { for (let i = 0; i < 12; i++) setTimeout(() => playTone(250+i*60, 0.15, 'triangle', 0.06), i*70); },
    };
    if (S[name]) S[name]();
}

// ── Types & Effectiveness ───────────────────────────────────
const TYPES = ['fire','ice','nature','electric','water','dark','holy','earth','wind','star'];
const TYPE_COLORS = {
    fire: '#ff5533', ice: '#55ccff', nature: '#55cc55', electric: '#ffcc22',
    water: '#3388ff', dark: '#8855bb', holy: '#ffeeaa', earth: '#cc8844',
    wind: '#88ccbb', star: '#ff77cc'
};
const TYPE_EMOJI = {
    fire: '🔥', ice: '❄️', nature: '🌿', electric: '⚡', water: '💧',
    dark: '🌙', holy: '☀️', earth: '🪨', wind: '🌬️', star: '⭐'
};
const TYPE_CHART = {
    fire: ['nature','ice','wind'], ice: ['water','wind','nature'], nature: ['water','earth','electric'],
    electric: ['water','wind','ice'], water: ['fire','earth','dark'], dark: ['holy','star','nature'],
    holy: ['dark','fire','earth'], earth: ['fire','electric','star'], wind: ['nature','earth','holy'],
    star: ['dark','ice','water']
};
function typeMultiplier(atkType, defType) {
    if (TYPE_CHART[atkType]?.includes(defType)) return 1.5;
    if (TYPE_CHART[defType]?.includes(atkType)) return 0.6;
    return 1.0;
}

// ── Evolution Stages ────────────────────────────────────────
const STAGES = ['Baby', 'Rookie', 'Champion', 'Ultimate', 'Mega'];
const STAGE_COLORS = ['#aaddaa', '#66bbff', '#ffaa44', '#ff6688', '#dd44ff'];

// ── Moves Database ──────────────────────────────────────────
const MOVES_DB = {
    tackle: { name: 'Tackle', type: 'earth', power: 25, acc: 100, pp: 35, desc: 'A basic body slam.', lvl: 1 },
    byte: { name: 'Byte', type: 'star', power: 30, acc: 95, pp: 30, desc: 'A digital data bite.', lvl: 1 },
    defend: { name: 'Protect', type: 'earth', power: 0, acc: 100, pp: 20, desc: 'Raises defense.', lvl: 1, effect: 'def_up' },
    fire_claw: { name: 'Fire Claw', type: 'fire', power: 45, acc: 92, pp: 20, desc: 'Slashes with fiery claws.', lvl: 5 },
    blaze_breath: { name: 'Blaze Breath', type: 'fire', power: 70, acc: 85, pp: 10, desc: 'Breathes searing flames!', lvl: 15 },
    inferno_blast: { name: 'Inferno Blast', type: 'fire', power: 95, acc: 75, pp: 5, desc: 'Ultimate fire technique.', lvl: 30 },
    frost_fang: { name: 'Frost Fang', type: 'ice', power: 42, acc: 93, pp: 22, desc: 'Bites with icy fangs.', lvl: 5 },
    glacier_charge: { name: 'Glacier Charge', type: 'ice', power: 68, acc: 85, pp: 12, desc: 'Charges coated in ice.', lvl: 15 },
    absolute_zero: { name: 'Absolute Zero', type: 'ice', power: 92, acc: 73, pp: 5, desc: 'Freezes everything solid.', lvl: 30 },
    vine_lash: { name: 'Vine Lash', type: 'nature', power: 42, acc: 94, pp: 22, desc: 'Whips with thorny vines.', lvl: 5 },
    petal_storm: { name: 'Petal Storm', type: 'nature', power: 65, acc: 88, pp: 12, desc: 'A storm of razor petals.', lvl: 15 },
    gaia_force: { name: 'Gaia Force', type: 'nature', power: 92, acc: 76, pp: 5, desc: 'The force of nature itself.', lvl: 30 },
    zap: { name: 'Zap', type: 'electric', power: 40, acc: 95, pp: 25, desc: 'A quick electric shock.', lvl: 5 },
    thunder_crash: { name: 'Thunder Crash', type: 'electric', power: 68, acc: 84, pp: 12, desc: 'Crashes with lightning.', lvl: 15 },
    omega_bolt: { name: 'Omega Bolt', type: 'electric', power: 95, acc: 72, pp: 5, desc: 'The ultimate lightning.', lvl: 30 },
    aqua_shot: { name: 'Aqua Shot', type: 'water', power: 42, acc: 93, pp: 22, desc: 'Shoots a water bullet.', lvl: 5 },
    tidal_wave: { name: 'Tidal Wave', type: 'water', power: 68, acc: 86, pp: 12, desc: 'Crashes with a huge wave.', lvl: 15 },
    ocean_abyss: { name: 'Ocean Abyss', type: 'water', power: 90, acc: 76, pp: 5, desc: 'Drags foe into the deep.', lvl: 30 },
    shadow_claw: { name: 'Shadow Claw', type: 'dark', power: 44, acc: 92, pp: 20, desc: 'Slashes from the shadows.', lvl: 5 },
    dark_pulse: { name: 'Dark Pulse', type: 'dark', power: 68, acc: 85, pp: 10, desc: 'A pulse of dark energy.', lvl: 15 },
    void_strike: { name: 'Void Strike', type: 'dark', power: 92, acc: 74, pp: 5, desc: 'Strikes from the void.', lvl: 30 },
    holy_beam: { name: 'Holy Beam', type: 'holy', power: 44, acc: 93, pp: 20, desc: 'A beam of holy light.', lvl: 5 },
    divine_aura: { name: 'Divine Aura', type: 'holy', power: 66, acc: 87, pp: 12, desc: 'Radiates divine energy.', lvl: 15 },
    heaven_strike: { name: 'Heaven Strike', type: 'holy', power: 90, acc: 76, pp: 5, desc: 'A strike from the heavens.', lvl: 30 },
    rock_smash: { name: 'Rock Smash', type: 'earth', power: 42, acc: 90, pp: 22, desc: 'Smashes with rocky fists.', lvl: 5 },
    quake_stomp: { name: 'Quake Stomp', type: 'earth', power: 68, acc: 84, pp: 10, desc: 'Stomps causing earthquakes.', lvl: 15 },
    terra_force: { name: 'Terra Force', type: 'earth', power: 95, acc: 73, pp: 5, desc: 'A massive earth energy ball.', lvl: 30 },
    gust_wing: { name: 'Gust Wing', type: 'wind', power: 40, acc: 95, pp: 22, desc: 'Slashes with wind blades.', lvl: 5 },
    cyclone_slash: { name: 'Cyclone Slash', type: 'wind', power: 65, acc: 87, pp: 12, desc: 'Slashes in a cyclone.', lvl: 15 },
    tempest_fury: { name: 'Tempest Fury', type: 'wind', power: 90, acc: 76, pp: 5, desc: 'An unstoppable tempest.', lvl: 30 },
    starlight: { name: 'Starlight', type: 'star', power: 44, acc: 94, pp: 20, desc: 'Strikes with starlight.', lvl: 5 },
    nova_burst: { name: 'Nova Burst', type: 'star', power: 68, acc: 85, pp: 10, desc: 'A burst of nova energy.', lvl: 15 },
    supernova: { name: 'Supernova', type: 'star', power: 95, acc: 72, pp: 5, desc: 'The ultimate cosmic blast!', lvl: 30 },
    heal: { name: 'Digital Heal', type: 'holy', power: 0, acc: 100, pp: 10, desc: 'Restores some HP.', lvl: 8, effect: 'heal_30' },
    mega_heal: { name: 'Mega Heal', type: 'holy', power: 0, acc: 100, pp: 5, desc: 'Restores lots of HP.', lvl: 22, effect: 'heal_60' },
    speed_boost: { name: 'Turbo Charge', type: 'wind', power: 0, acc: 100, pp: 15, desc: 'Greatly increases speed.', lvl: 10, effect: 'spd_up' },
    power_up: { name: 'Power Charge', type: 'fire', power: 0, acc: 100, pp: 15, desc: 'Greatly increases attack.', lvl: 10, effect: 'atk_up' },
};

// ── Digital Creature Species ────────────────────────────────
// Each has: Baby → Rookie → Champion → Ultimate → Mega evolution chain
const SPECIES = [
    // === FIRE LINE: Flambit → Pyrodrake → Infernox → Blazewyrm → Volcanus ===
    { id: 0, name: 'Flambit', type: 'fire', stage: 0, baseHp: 35, baseAtk: 42, baseDef: 30, baseSpd: 40,
      desc: 'A tiny flame sprite that bounces happily. Its tail flickers like a candle.',
      moves: ['tackle','byte','fire_claw','power_up','blaze_breath','inferno_blast'],
      evolveLevel: 10, evolveTo: 1, color: '#ff8844', rarity: 'starter',
      body: 'round', ears: 'pointy', tail: 'flame', bodyColor: '#ff7733', accentColor: '#ffaa44' },
    { id: 1, name: 'Pyrodrake', type: 'fire', stage: 1, baseHp: 48, baseAtk: 58, baseDef: 40, baseSpd: 52,
      desc: 'A young fire drake. Small wings sprout from its back.',
      moves: ['byte','fire_claw','power_up','blaze_breath','inferno_blast','speed_boost'],
      evolveLevel: 20, evolveTo: 2, color: '#ff5522', rarity: 'uncommon',
      body: 'dragon', ears: 'horns', tail: 'flame', bodyColor: '#ee4422', accentColor: '#ff8844' },
    { id: 2, name: 'Infernox', type: 'fire', stage: 2, baseHp: 62, baseAtk: 78, baseDef: 52, baseSpd: 65,
      desc: 'A fierce fire dragon. Its roar echoes through digital mountains.',
      moves: ['fire_claw','blaze_breath','inferno_blast','power_up','speed_boost','terra_force'],
      evolveLevel: 32, evolveTo: 3, color: '#dd3311', rarity: 'rare',
      body: 'dragon', ears: 'horns', tail: 'flame', bodyColor: '#cc2211', accentColor: '#ff6633' },
    { id: 3, name: 'Blazewyrm', type: 'fire', stage: 3, baseHp: 78, baseAtk: 92, baseDef: 65, baseSpd: 78,
      desc: 'A legendary fire wyrm. Volcanoes erupt in its wake.',
      moves: ['blaze_breath','inferno_blast','power_up','speed_boost','terra_force','supernova'],
      evolveLevel: 44, evolveTo: 4, color: '#bb2200', rarity: 'epic',
      body: 'dragon', ears: 'horns', tail: 'flame', bodyColor: '#aa1100', accentColor: '#ff4422' },
    { id: 4, name: 'Volcanus', type: 'fire', stage: 4, baseHp: 92, baseAtk: 105, baseDef: 78, baseSpd: 88,
      desc: 'The supreme fire beast. It IS the volcano. Digital legends speak of its power.',
      moves: ['inferno_blast','power_up','speed_boost','terra_force','supernova','mega_heal'],
      color: '#991100', rarity: 'legendary',
      body: 'dragon', ears: 'crown', tail: 'flame', bodyColor: '#880000', accentColor: '#ff3300' },

    // === ICE LINE: Frostkit → Glaciapup → Cryowolf → Blizzarion → Absolutor ===
    { id: 5, name: 'Frostkit', type: 'ice', stage: 0, baseHp: 38, baseAtk: 32, baseDef: 45, baseSpd: 35,
      desc: 'A tiny ice kitten with crystals on its ears. Loves to slide on ice.',
      moves: ['tackle','byte','frost_fang','defend','glacier_charge','absolute_zero'],
      evolveLevel: 10, evolveTo: 6, color: '#88ddff', rarity: 'starter',
      body: 'cat', ears: 'cat', tail: 'fluffy', bodyColor: '#aaeeff', accentColor: '#66bbff' },
    { id: 6, name: 'Glaciapup', type: 'ice', stage: 1, baseHp: 52, baseAtk: 44, baseDef: 62, baseSpd: 45,
      desc: 'An ice wolf pup with a frosty mane. Incredibly loyal.',
      moves: ['byte','frost_fang','defend','glacier_charge','absolute_zero','heal'],
      evolveLevel: 20, evolveTo: 7, color: '#66ccff', rarity: 'uncommon',
      body: 'wolf', ears: 'wolf', tail: 'fluffy', bodyColor: '#88ccff', accentColor: '#4488ff' },
    { id: 7, name: 'Cryowolf', type: 'ice', stage: 2, baseHp: 68, baseAtk: 58, baseDef: 78, baseSpd: 58,
      desc: 'A majestic ice wolf. Frost forms wherever it treads.',
      moves: ['frost_fang','glacier_charge','absolute_zero','defend','heal','mega_heal'],
      evolveLevel: 32, evolveTo: 8, color: '#44aaff', rarity: 'rare',
      body: 'wolf', ears: 'wolf', tail: 'fluffy', bodyColor: '#66aaff', accentColor: '#2266dd' },
    { id: 8, name: 'Blizzarion', type: 'ice', stage: 3, baseHp: 82, baseAtk: 72, baseDef: 92, baseSpd: 68,
      desc: 'A mythical ice beast. Blizzards follow in its path.',
      moves: ['glacier_charge','absolute_zero','defend','heal','mega_heal','speed_boost'],
      evolveLevel: 44, evolveTo: 9, color: '#2288ff', rarity: 'epic',
      body: 'wolf', ears: 'crown', tail: 'fluffy', bodyColor: '#4488ff', accentColor: '#1155cc' },
    { id: 9, name: 'Absolutor', type: 'ice', stage: 4, baseHp: 95, baseAtk: 82, baseDef: 108, baseSpd: 78,
      desc: 'The ultimate ice guardian. It embodies absolute zero itself.',
      moves: ['absolute_zero','defend','mega_heal','speed_boost','supernova','heaven_strike'],
      color: '#1166dd', rarity: 'legendary',
      body: 'wolf', ears: 'crown', tail: 'fluffy', bodyColor: '#2266cc', accentColor: '#0044aa' },

    // === NATURE LINE: Sproutling → Vineraptor → Floradon → Gaiabeast → Yggdrasil ===
    { id: 10, name: 'Sproutling', type: 'nature', stage: 0, baseHp: 42, baseAtk: 35, baseDef: 38, baseSpd: 38,
      desc: 'A tiny plant creature with a flower bud on its head. Always smiling!',
      moves: ['tackle','byte','vine_lash','heal','petal_storm','gaia_force'],
      evolveLevel: 10, evolveTo: 11, color: '#88dd66', rarity: 'starter',
      body: 'round', ears: 'leaf', tail: 'vine', bodyColor: '#66cc44', accentColor: '#aaee66' },
    { id: 11, name: 'Vineraptor', type: 'nature', stage: 1, baseHp: 58, baseAtk: 48, baseDef: 50, baseSpd: 50,
      desc: 'A swift plant raptor. Vines whip from its claws.',
      moves: ['vine_lash','heal','petal_storm','gaia_force','speed_boost','mega_heal'],
      evolveLevel: 20, evolveTo: 12, color: '#66bb44', rarity: 'uncommon',
      body: 'raptor', ears: 'leaf', tail: 'vine', bodyColor: '#55aa33', accentColor: '#88dd55' },
    { id: 12, name: 'Floradon', type: 'nature', stage: 2, baseHp: 75, baseAtk: 62, baseDef: 62, baseSpd: 62,
      desc: 'A powerful plant dragon covered in blooming flowers.',
      moves: ['petal_storm','gaia_force','heal','mega_heal','speed_boost','power_up'],
      evolveLevel: 32, evolveTo: 13, color: '#44aa22', rarity: 'rare',
      body: 'dragon', ears: 'leaf', tail: 'vine', bodyColor: '#339922', accentColor: '#66cc44' },
    { id: 13, name: 'Gaiabeast', type: 'nature', stage: 3, baseHp: 88, baseAtk: 75, baseDef: 75, baseSpd: 72,
      desc: 'A legendary nature titan. Forests grow in its footsteps.',
      moves: ['gaia_force','mega_heal','speed_boost','power_up','supernova','heaven_strike'],
      evolveLevel: 44, evolveTo: 14, color: '#338811', rarity: 'epic',
      body: 'titan', ears: 'crown', tail: 'vine', bodyColor: '#227711', accentColor: '#55aa33' },
    { id: 14, name: 'Yggdrasil', type: 'nature', stage: 4, baseHp: 105, baseAtk: 85, baseDef: 85, baseSpd: 82,
      desc: 'The world tree incarnate. All digital life flows through it.',
      moves: ['gaia_force','mega_heal','speed_boost','power_up','supernova','heaven_strike'],
      color: '#226600', rarity: 'legendary',
      body: 'titan', ears: 'crown', tail: 'vine', bodyColor: '#115500', accentColor: '#44aa22' },

    // === ELECTRIC: Zapbit → Thunderpaw → Stormwing ===
    { id: 15, name: 'Zapbit', type: 'electric', stage: 0, baseHp: 34, baseAtk: 44, baseDef: 30, baseSpd: 52,
      desc: 'A hyper-fast electric sprite. Static sparks fly off its fur.',
      moves: ['tackle','zap','speed_boost','thunder_crash','omega_bolt'],
      evolveLevel: 12, evolveTo: 16, color: '#ffdd33', rarity: 'common',
      body: 'round', ears: 'pointy', tail: 'bolt', bodyColor: '#ffcc22', accentColor: '#ffee66' },
    { id: 16, name: 'Thunderpaw', type: 'electric', stage: 1, baseHp: 48, baseAtk: 62, baseDef: 42, baseSpd: 72,
      desc: 'A sleek electric beast. Lightning crackles in its mane.',
      moves: ['zap','speed_boost','thunder_crash','omega_bolt','power_up'],
      evolveLevel: 28, evolveTo: 17, color: '#ddaa00', rarity: 'uncommon',
      body: 'wolf', ears: 'pointy', tail: 'bolt', bodyColor: '#ccaa00', accentColor: '#ffdd44' },
    { id: 17, name: 'Stormwing', type: 'electric', stage: 2, baseHp: 65, baseAtk: 82, baseDef: 55, baseSpd: 92,
      desc: 'A legendary storm bird. Thunder follows in its wings.',
      moves: ['thunder_crash','omega_bolt','speed_boost','power_up','tempest_fury'],
      color: '#bb8800', rarity: 'rare',
      body: 'bird', ears: 'crest', tail: 'bolt', bodyColor: '#aa7700', accentColor: '#ffcc22' },

    // === WATER: Bubblefin → Aquadrake → Leviathan ===
    { id: 18, name: 'Bubblefin', type: 'water', stage: 0, baseHp: 40, baseAtk: 36, baseDef: 42, baseSpd: 38,
      desc: 'A cute water creature with bubble-like fins. Loves to splash!',
      moves: ['tackle','aqua_shot','defend','tidal_wave','ocean_abyss'],
      evolveLevel: 12, evolveTo: 19, color: '#55aaff', rarity: 'common',
      body: 'round', ears: 'fin', tail: 'fish', bodyColor: '#4499ff', accentColor: '#77ccff' },
    { id: 19, name: 'Aquadrake', type: 'water', stage: 1, baseHp: 58, baseAtk: 52, baseDef: 58, baseSpd: 50,
      desc: 'A graceful water dragon. Rides the currents effortlessly.',
      moves: ['aqua_shot','defend','tidal_wave','ocean_abyss','heal'],
      evolveLevel: 28, evolveTo: 20, color: '#3388ff', rarity: 'uncommon',
      body: 'dragon', ears: 'fin', tail: 'fish', bodyColor: '#2277ee', accentColor: '#55aaff' },
    { id: 20, name: 'Leviathan', type: 'water', stage: 2, baseHp: 80, baseAtk: 72, baseDef: 78, baseSpd: 62,
      desc: 'A colossal sea serpent. The oceans tremble at its presence.',
      moves: ['tidal_wave','ocean_abyss','defend','heal','mega_heal'],
      color: '#1166dd', rarity: 'rare',
      body: 'serpent', ears: 'fin', tail: 'fish', bodyColor: '#0055cc', accentColor: '#3388ff' },

    // === DARK: Shadowkit → Eclipsor → Voidreaper ===
    { id: 21, name: 'Shadowkit', type: 'dark', stage: 0, baseHp: 36, baseAtk: 46, baseDef: 32, baseSpd: 46,
      desc: 'A mysterious dark kitten. Its eyes glow in the shadows.',
      moves: ['tackle','shadow_claw','speed_boost','dark_pulse','void_strike'],
      evolveLevel: 14, evolveTo: 22, color: '#9966cc', rarity: 'uncommon',
      body: 'cat', ears: 'bat', tail: 'shadow', bodyColor: '#7744aa', accentColor: '#bb88dd' },
    { id: 22, name: 'Eclipsor', type: 'dark', stage: 1, baseHp: 52, baseAtk: 68, baseDef: 45, baseSpd: 65,
      desc: 'A sleek dark beast. It can meld with shadows at will.',
      moves: ['shadow_claw','dark_pulse','void_strike','speed_boost','power_up'],
      evolveLevel: 30, evolveTo: 23, color: '#7744aa', rarity: 'rare',
      body: 'wolf', ears: 'bat', tail: 'shadow', bodyColor: '#5533aa', accentColor: '#9966cc' },
    { id: 23, name: 'Voidreaper', type: 'dark', stage: 2, baseHp: 70, baseAtk: 90, baseDef: 58, baseSpd: 82,
      desc: 'The embodiment of digital darkness. Reality bends around it.',
      moves: ['dark_pulse','void_strike','speed_boost','power_up','supernova'],
      color: '#5522aa', rarity: 'epic',
      body: 'reaper', ears: 'crown', tail: 'shadow', bodyColor: '#3311aa', accentColor: '#7744cc' },

    // === HOLY: Halopup → Seraphim → Celestior ===
    { id: 24, name: 'Halopup', type: 'holy', stage: 0, baseHp: 42, baseAtk: 35, baseDef: 40, baseSpd: 38,
      desc: 'A tiny angelic puppy with a glowing halo. Radiates warmth.',
      moves: ['tackle','holy_beam','heal','divine_aura','heaven_strike','mega_heal'],
      evolveLevel: 14, evolveTo: 25, color: '#ffeeaa', rarity: 'uncommon',
      body: 'round', ears: 'angel', tail: 'halo', bodyColor: '#ffddaa', accentColor: '#ffee88' },
    { id: 25, name: 'Seraphim', type: 'holy', stage: 1, baseHp: 60, baseAtk: 52, baseDef: 58, baseSpd: 52,
      desc: 'A radiant angel beast. Its six wings shimmer with light.',
      moves: ['holy_beam','divine_aura','heaven_strike','heal','mega_heal','defend'],
      evolveLevel: 30, evolveTo: 26, color: '#ffdd66', rarity: 'rare',
      body: 'angel', ears: 'angel', tail: 'halo', bodyColor: '#ffcc66', accentColor: '#ffee88' },
    { id: 26, name: 'Celestior', type: 'holy', stage: 2, baseHp: 82, baseAtk: 68, baseDef: 78, baseSpd: 68,
      desc: 'A divine celestial being. Light itself bows to its presence.',
      moves: ['divine_aura','heaven_strike','mega_heal','defend','supernova'],
      color: '#ffcc44', rarity: 'epic',
      body: 'angel', ears: 'crown', tail: 'halo', bodyColor: '#ffbb44', accentColor: '#ffee66' },

    // === EARTH: Pebblite → Golemor ===
    { id: 27, name: 'Pebblite', type: 'earth', stage: 0, baseHp: 48, baseAtk: 38, baseDef: 52, baseSpd: 25,
      desc: 'A sturdy little rock creature. Slow but incredibly tough.',
      moves: ['tackle','rock_smash','defend','quake_stomp','terra_force'],
      evolveLevel: 14, evolveTo: 28, color: '#cc9955', rarity: 'common',
      body: 'round', ears: 'rock', tail: 'rock', bodyColor: '#bb8844', accentColor: '#ddaa66' },
    { id: 28, name: 'Golemor', type: 'earth', stage: 1, baseHp: 72, baseAtk: 58, baseDef: 82, baseSpd: 35,
      desc: 'A massive rock golem. The ground trembles with each step.',
      moves: ['rock_smash','quake_stomp','terra_force','defend','power_up'],
      color: '#997733', rarity: 'rare',
      body: 'titan', ears: 'rock', tail: 'rock', bodyColor: '#886622', accentColor: '#bb9944' },

    // === WIND: Breezling → Galewolf ===
    { id: 29, name: 'Breezling', type: 'wind', stage: 0, baseHp: 34, baseAtk: 34, baseDef: 30, baseSpd: 55,
      desc: 'A wispy little air spirit. It floats gently on the breeze.',
      moves: ['tackle','gust_wing','speed_boost','cyclone_slash','tempest_fury'],
      evolveLevel: 12, evolveTo: 30, color: '#88ddbb', rarity: 'common',
      body: 'bird', ears: 'feather', tail: 'feather', bodyColor: '#77ccaa', accentColor: '#aaeedd' },
    { id: 30, name: 'Galewolf', type: 'wind', stage: 1, baseHp: 52, baseAtk: 52, baseDef: 44, baseSpd: 85,
      desc: 'A swift wind wolf. Moves faster than the eye can follow.',
      moves: ['gust_wing','cyclone_slash','tempest_fury','speed_boost','power_up'],
      color: '#55bb88', rarity: 'rare',
      body: 'wolf', ears: 'feather', tail: 'feather', bodyColor: '#44aa77', accentColor: '#88ddbb' },

    // === STAR: Twinklit → Cosmolion → Galaxion ===
    { id: 31, name: 'Twinklit', type: 'star', stage: 0, baseHp: 38, baseAtk: 40, baseDef: 38, baseSpd: 44,
      desc: 'A tiny star creature. Wishes come true when it sparkles.',
      moves: ['byte','starlight','heal','nova_burst','supernova','mega_heal'],
      evolveLevel: 16, evolveTo: 32, color: '#ff88cc', rarity: 'rare',
      body: 'round', ears: 'star', tail: 'star', bodyColor: '#ff77bb', accentColor: '#ffaadd' },
    { id: 32, name: 'Cosmolion', type: 'star', stage: 1, baseHp: 58, baseAtk: 62, baseDef: 55, baseSpd: 60,
      desc: 'A cosmic lion. Galaxies swirl in its mane.',
      moves: ['starlight','nova_burst','supernova','heal','speed_boost','power_up'],
      evolveLevel: 34, evolveTo: 33, color: '#dd66aa', rarity: 'epic',
      body: 'wolf', ears: 'star', tail: 'star', bodyColor: '#cc5599', accentColor: '#ff88cc' },
    { id: 33, name: 'Galaxion', type: 'star', stage: 4, baseHp: 85, baseAtk: 85, baseDef: 80, baseSpd: 80,
      desc: 'The cosmic sovereign. Contains the power of an entire galaxy.',
      moves: ['nova_burst','supernova','mega_heal','speed_boost','power_up','heaven_strike'],
      color: '#aa4488', rarity: 'legendary',
      body: 'titan', ears: 'crown', tail: 'star', bodyColor: '#993377', accentColor: '#dd66aa' },
];

// ── Create a creature instance ──────────────────────────────
function createCreature(speciesId, level) {
    const sp = SPECIES[speciesId];
    level = Math.min(level, MAX_LEVEL);
    const m = 1 + (level - 1) * 0.08;
    const hp = Math.floor(sp.baseHp * m);
    const moves = sp.moves.filter(mv => MOVES_DB[mv].lvl <= level).slice(-4);
    if (moves.length === 0) moves.push('tackle');
    const movePP = {};
    moves.forEach(mv => movePP[mv] = MOVES_DB[mv].pp);
    return {
        speciesId, species: sp, name: sp.name, level, xp: 0,
        maxHp: hp, hp, atk: Math.floor(sp.baseAtk * m),
        def: Math.floor(sp.baseDef * m), spd: Math.floor(sp.baseSpd * m),
        moves, movePP, type: sp.type, caught: true
    };
}
function xpToNext(level) { return Math.floor(20 * Math.pow(level, 1.5)); }
function addXP(creature, amount) {
    const messages = [];
    creature.xp += amount;
    while (creature.xp >= xpToNext(creature.level) && creature.level < MAX_LEVEL) {
        creature.xp -= xpToNext(creature.level);
        creature.level++;
        const sp = creature.species;
        const m = 1 + (creature.level - 1) * 0.08;
        creature.maxHp = Math.floor(sp.baseHp * m);
        creature.hp = Math.min(creature.hp + 5, creature.maxHp);
        creature.atk = Math.floor(sp.baseAtk * m);
        creature.def = Math.floor(sp.baseDef * m);
        creature.spd = Math.floor(sp.baseSpd * m);
        // Learn new moves
        sp.moves.filter(mv => MOVES_DB[mv].lvl === creature.level).forEach(mv => {
            if (creature.moves.length < 4) {
                creature.moves.push(mv);
                creature.movePP[mv] = MOVES_DB[mv].pp;
                messages.push(`${creature.name} learned ${MOVES_DB[mv].name}!`);
            } else {
                let weakest = 0;
                for (let i = 1; i < creature.moves.length; i++)
                    if (MOVES_DB[creature.moves[i]].power < MOVES_DB[creature.moves[weakest]].power) weakest = i;
                if (MOVES_DB[mv].power > MOVES_DB[creature.moves[weakest]].power) {
                    const old = creature.moves[weakest];
                    creature.moves[weakest] = mv;
                    creature.movePP[mv] = MOVES_DB[mv].pp;
                    delete creature.movePP[old];
                    messages.push(`${creature.name} forgot ${MOVES_DB[old].name} and learned ${MOVES_DB[mv].name}!`);
                }
            }
        });
        messages.push(`${creature.name} grew to level ${creature.level}!`);
        // Digivolution!
        if (sp.evolveLevel && creature.level >= sp.evolveLevel && sp.evolveTo !== undefined) {
            const newSp = SPECIES[sp.evolveTo];
            messages.push(`✨ ${creature.name} is digivolving into ${newSp.name}! ✨`);
            creature.speciesId = sp.evolveTo;
            creature.species = newSp;
            creature.name = newSp.name;
            creature.type = newSp.type;
            const m2 = 1 + (creature.level - 1) * 0.08;
            creature.maxHp = Math.floor(newSp.baseHp * m2);
            creature.hp = creature.maxHp;
            creature.atk = Math.floor(newSp.baseAtk * m2);
            creature.def = Math.floor(newSp.baseDef * m2);
            creature.spd = Math.floor(newSp.baseSpd * m2);
        }
    }
    return messages;
}

// ── Items Database ──────────────────────────────────────────
const ITEMS = {
    potion: { name: 'Data Potion', desc: 'Restores 30 HP.', price: 100, effect: 'heal', value: 30, emoji: '💊' },
    super_potion: { name: 'Super Potion', desc: 'Restores 70 HP.', price: 300, effect: 'heal', value: 70, emoji: '💉' },
    max_potion: { name: 'Max Potion', desc: 'Fully restores HP.', price: 800, effect: 'heal', value: 9999, emoji: '🧬' },
    digi_egg: { name: 'Digi-Egg', desc: 'Catches wild creatures.', price: 150, effect: 'catch', value: 1.0, emoji: '🥚' },
    golden_egg: { name: 'Golden Egg', desc: 'Better catch rate.', price: 400, effect: 'catch', value: 1.5, emoji: '🪺' },
    prism_egg: { name: 'Prism Egg', desc: 'High catch rate!', price: 800, effect: 'catch', value: 2.0, emoji: '💎' },
    revive: { name: 'Revive Chip', desc: 'Revives a fainted creature.', price: 500, effect: 'revive', value: 0.5, emoji: '💫' },
    atk_chip: { name: 'ATK Chip', desc: '+5 ATK permanently.', price: 600, effect: 'stat_atk', value: 5, emoji: '⚔️' },
    def_chip: { name: 'DEF Chip', desc: '+5 DEF permanently.', price: 600, effect: 'stat_def', value: 5, emoji: '🛡️' },
    spd_chip: { name: 'SPD Chip', desc: '+5 SPD permanently.', price: 600, effect: 'stat_spd', value: 5, emoji: '👟' },
};

// ── Tile Definitions ────────────────────────────────────────
const T = {
    GRASS: 0, PATH: 1, WATER: 2, TREE: 3, BUILDING: 4, TALL_GRASS: 5,
    FLOWER: 6, SAND: 7, ROCK: 8, DOOR: 9, SIGN: 10, FENCE: 11,
    BRIDGE: 12, CAVE_FLOOR: 13, CAVE_WALL: 14, DARK_GRASS: 15,
    SNOW: 16, ICE: 17, LAVA: 18, CHEST: 19, DIGITAL: 20
};
const WALKABLE = new Set([T.GRASS, T.PATH, T.TALL_GRASS, T.FLOWER, T.SAND, T.DOOR, T.BRIDGE, T.CAVE_FLOOR, T.DARK_GRASS, T.SNOW, T.ICE, T.DIGITAL]);
const TILE_COLORS = {
    [T.GRASS]: '#4ab84a', [T.PATH]: '#c8a868', [T.WATER]: '#3a8ad8',
    [T.TREE]: '#2a7a48', [T.BUILDING]: '#887050', [T.TALL_GRASS]: '#328a32',
    [T.FLOWER]: '#4ab84a', [T.SAND]: '#e0cc98', [T.ROCK]: '#777',
    [T.DOOR]: '#8b5a2b', [T.SIGN]: '#c8a868', [T.FENCE]: '#a05020',
    [T.BRIDGE]: '#b88608', [T.CAVE_FLOOR]: '#484848', [T.CAVE_WALL]: '#282828',
    [T.DARK_GRASS]: '#226622', [T.SNOW]: '#e4e4f0', [T.ICE]: '#98d0f0',
    [T.LAVA]: '#ff4422', [T.CHEST]: '#c8a868', [T.DIGITAL]: '#1a1a3a'
};

// ── World Maps ──────────────────────────────────────────────
function makeMap(w, h, fill) {
    const m = [];
    for (let y = 0; y < h; y++) { m[y] = []; for (let x = 0; x < w; x++) m[y][x] = fill; }
    return m;
}
function setRect(map, x1, y1, x2, y2, tile) {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) if (map[y]?.[x] !== undefined) map[y][x] = tile;
}

function createStarterTown() {
    const m = makeMap(30, 25, T.GRASS);
    setRect(m, 0, 12, 29, 13, T.PATH); setRect(m, 14, 0, 15, 24, T.PATH);
    setRect(m, 5, 6, 24, 7, T.PATH); setRect(m, 5, 18, 24, 19, T.PATH);
    setRect(m, 3, 3, 7, 5, T.BUILDING); m[6][5] = T.DOOR;
    setRect(m, 18, 3, 24, 6, T.BUILDING); m[7][21] = T.DOOR;
    setRect(m, 3, 15, 7, 17, T.BUILDING); m[18][5] = T.DOOR;
    setRect(m, 18, 15, 24, 17, T.BUILDING); m[18][21] = T.DOOR;
    for (let i = 0; i < 20; i++) { const fx = Math.floor(Math.random()*30), fy = Math.floor(Math.random()*25); if (m[fy][fx] === T.GRASS) m[fy][fx] = T.FLOWER; }
    for (let x = 0; x < 30; x++) { m[0][x] = T.TREE; m[24][x] = T.TREE; }
    for (let y = 0; y < 25; y++) { m[y][0] = T.TREE; m[y][29] = T.TREE; }
    for (let x = 2; x <= 8; x++) { m[2][x] = T.FENCE; m[8][x] = T.FENCE; }
    for (let x = 17; x <= 25; x++) m[2][x] = T.FENCE;
    setRect(m, 10, 20, 13, 23, T.WATER);
    m[12][29] = T.PATH; m[13][29] = T.PATH;
    m[12][12] = T.SIGN; m[7][15] = T.SIGN;
    return m;
}

function createRoute1() {
    const m = makeMap(40, 20, T.GRASS);
    setRect(m, 0, 9, 39, 10, T.PATH);
    setRect(m, 5, 3, 12, 7, T.TALL_GRASS); setRect(m, 18, 12, 25, 16, T.TALL_GRASS);
    setRect(m, 30, 3, 37, 8, T.TALL_GRASS);
    for (let x = 0; x < 40; x++) { m[0][x] = T.TREE; m[19][x] = T.TREE; }
    for (let y = 0; y < 20; y++) { m[y][0] = T.TREE; m[y][39] = T.TREE; }
    setRect(m, 14, 14, 16, 17, T.WATER);
    for (let i = 0; i < 12; i++) { const fx = 1+Math.floor(Math.random()*38), fy = 1+Math.floor(Math.random()*18); if (m[fy][fx] === T.GRASS) m[fy][fx] = T.FLOWER; }
    m[9][0] = T.PATH; m[10][0] = T.PATH; m[9][39] = T.PATH; m[10][39] = T.PATH;
    m[9][3] = T.SIGN;
    return m;
}

function createDigiCity() {
    const m = makeMap(35, 30, T.DIGITAL);
    setRect(m, 1, 1, 33, 28, T.PATH);
    setRect(m, 0, 14, 34, 15, T.PATH); setRect(m, 16, 0, 17, 29, T.PATH);
    setRect(m, 5, 8, 28, 9, T.PATH); setRect(m, 5, 20, 28, 21, T.PATH);
    setRect(m, 3, 4, 9, 7, T.BUILDING); m[8][6] = T.DOOR;
    setRect(m, 22, 4, 28, 7, T.BUILDING); m[8][25] = T.DOOR;
    setRect(m, 3, 16, 9, 19, T.BUILDING); m[20][6] = T.DOOR;
    setRect(m, 22, 16, 28, 19, T.BUILDING); m[20][25] = T.DOOR;
    setRect(m, 11, 22, 15, 25, T.BUILDING); m[25][13] = T.DOOR;
    for (let x = 0; x < 35; x++) { m[0][x] = T.ROCK; m[29][x] = T.ROCK; }
    for (let y = 0; y < 30; y++) { m[y][0] = T.ROCK; m[y][34] = T.ROCK; }
    setRect(m, 15, 12, 18, 13, T.WATER);
    m[11][15] = T.FLOWER; m[11][18] = T.FLOWER; m[14][14] = T.FLOWER; m[14][19] = T.FLOWER;
    m[14][0] = T.PATH; m[15][0] = T.PATH; m[14][34] = T.PATH; m[15][34] = T.PATH;
    m[29][16] = T.PATH; m[29][17] = T.PATH;
    m[14][3] = T.SIGN; m[9][16] = T.SIGN;
    return m;
}

function createDataCavern() {
    const m = makeMap(30, 25, T.CAVE_WALL);
    setRect(m, 2, 2, 27, 22, T.CAVE_FLOOR);
    setRect(m, 8, 5, 12, 10, T.CAVE_WALL); setRect(m, 18, 12, 22, 18, T.CAVE_WALL);
    setRect(m, 5, 15, 8, 20, T.CAVE_WALL);
    setRect(m, 14, 3, 20, 6, T.DARK_GRASS); setRect(m, 3, 8, 6, 13, T.DARK_GRASS);
    setRect(m, 22, 5, 26, 10, T.DARK_GRASS); setRect(m, 10, 18, 16, 21, T.DARK_GRASS);
    setRect(m, 14, 9, 16, 11, T.WATER); setRect(m, 24, 19, 26, 21, T.WATER);
    m[4][26] = T.CHEST; m[20][4] = T.CHEST;
    m[12][0] = T.CAVE_FLOOR; m[0][15] = T.CAVE_FLOOR;
    return m;
}

function createBeachZone() {
    const m = makeMap(40, 20, T.SAND);
    setRect(m, 0, 14, 39, 19, T.WATER);
    setRect(m, 3, 3, 8, 6, T.TALL_GRASS); setRect(m, 25, 2, 32, 5, T.TALL_GRASS);
    setRect(m, 0, 9, 39, 10, T.PATH);
    for (let x = 0; x < 40; x++) m[0][x] = T.TREE;
    for (let y = 0; y < 14; y++) { m[y][0] = T.TREE; m[y][39] = T.TREE; }
    setRect(m, 18, 10, 19, 16, T.BRIDGE);
    m[8][10] = T.ROCK; m[6][20] = T.ROCK; m[7][33] = T.ROCK;
    m[12][35] = T.CHEST;
    m[9][0] = T.PATH; m[10][0] = T.PATH; m[9][39] = T.PATH; m[10][39] = T.PATH;
    m[9][3] = T.SIGN;
    return m;
}

function createVolcanoPeak() {
    const m = makeMap(30, 30, T.ROCK);
    setRect(m, 2, 14, 27, 15, T.PATH); setRect(m, 14, 2, 15, 27, T.PATH);
    setRect(m, 3, 3, 10, 8, T.GRASS); setRect(m, 5, 4, 8, 7, T.TALL_GRASS);
    setRect(m, 18, 3, 26, 10, T.GRASS); setRect(m, 20, 5, 24, 8, T.TALL_GRASS);
    setRect(m, 3, 18, 10, 26, T.GRASS); setRect(m, 4, 19, 8, 24, T.TALL_GRASS);
    setRect(m, 18, 18, 26, 26, T.GRASS); setRect(m, 20, 20, 25, 25, T.TALL_GRASS);
    setRect(m, 11, 4, 17, 8, T.BUILDING); m[9][14] = T.DOOR;
    for (let x = 0; x < 30; x++) { m[0][x] = T.ROCK; m[29][x] = T.ROCK; }
    for (let y = 0; y < 30; y++) { m[y][0] = T.ROCK; m[y][29] = T.ROCK; }
    m[14][0] = T.PATH; m[15][0] = T.PATH; m[14][29] = T.PATH; m[15][29] = T.PATH;
    setRect(m, 12, 22, 16, 25, T.LAVA);
    m[14][3] = T.SIGN; m[26][26] = T.CHEST;
    return m;
}

function createShadowRealm() {
    const m = makeMap(35, 25, T.DARK_GRASS);
    setRect(m, 0, 12, 34, 13, T.PATH); setRect(m, 16, 0, 17, 24, T.PATH);
    setRect(m, 5, 5, 8, 8, T.WATER); setRect(m, 25, 17, 28, 20, T.WATER);
    setRect(m, 10, 3, 22, 5, T.DIGITAL); setRect(m, 10, 19, 22, 22, T.DIGITAL);
    setRect(m, 12, 7, 20, 10, T.BUILDING); m[11][16] = T.DOOR;
    for (let x = 0; x < 35; x++) { m[0][x] = T.TREE; m[24][x] = T.TREE; }
    for (let y = 0; y < 25; y++) { m[y][0] = T.TREE; m[y][34] = T.TREE; }
    m[12][0] = T.PATH; m[13][0] = T.PATH; m[12][34] = T.PATH; m[13][34] = T.PATH;
    m[4][30] = T.CHEST; m[22][4] = T.CHEST; m[12][3] = T.SIGN;
    return m;
}

function createFinalArena() {
    const m = makeMap(25, 25, T.DIGITAL);
    setRect(m, 1, 1, 23, 23, T.PATH);
    setRect(m, 11, 0, 13, 24, T.PATH); setRect(m, 3, 12, 21, 13, T.PATH);
    setRect(m, 6, 3, 18, 8, T.BUILDING); m[9][12] = T.DOOR;
    setRect(m, 3, 16, 8, 19, T.BUILDING); m[20][5] = T.DOOR; m[20][6] = T.PATH;
    setRect(m, 16, 16, 21, 19, T.BUILDING); m[20][18] = T.DOOR; m[20][19] = T.PATH;
    setRect(m, 10, 11, 14, 14, T.WATER); m[12][12] = T.FLOWER;
    for (let i = 0; i < 20; i++) { const fx = 1+Math.floor(Math.random()*23), fy = 1+Math.floor(Math.random()*23); if (m[fy][fx] === T.PATH) m[fy][fx] = T.FLOWER; }
    for (let x = 0; x < 25; x++) { m[0][x] = T.FENCE; m[24][x] = T.FENCE; }
    for (let y = 0; y < 25; y++) { m[y][0] = T.FENCE; m[y][24] = T.FENCE; }
    m[24][12] = T.PATH; m[24][13] = T.PATH; m[10][12] = T.SIGN;
    return m;
}

// ── Zones ───────────────────────────────────────────────────
const ZONES = [
    { id: 0, name: 'Byte Village', map: createStarterTown(), wildLevels: [2,5], encounters: { [T.TALL_GRASS]: [27,29,24] } },
    { id: 1, name: 'Data Route', map: createRoute1(), wildLevels: [3,7], encounters: { [T.TALL_GRASS]: [15,18,27,29] } },
    { id: 2, name: 'Circuit City', map: createDigiCity(), wildLevels: [5,10], encounters: {} },
    { id: 3, name: 'Data Cavern', map: createDataCavern(), wildLevels: [8,14], encounters: { [T.DARK_GRASS]: [21,27,31], [T.CAVE_FLOOR]: [27] } },
    { id: 4, name: 'Pixel Beach', map: createBeachZone(), wildLevels: [10,16], encounters: { [T.TALL_GRASS]: [18,24,29] } },
    { id: 5, name: 'Volcano Peak', map: createVolcanoPeak(), wildLevels: [14,22], encounters: { [T.TALL_GRASS]: [15,21,31] } },
    { id: 6, name: 'Shadow Realm', map: createShadowRealm(), wildLevels: [18,28], encounters: { [T.DARK_GRASS]: [21,31,29] } },
    { id: 7, name: 'Final Arena', map: createFinalArena(), wildLevels: [25,35], encounters: {} },
];

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

// ── NPCs ────────────────────────────────────────────────────
const NPCS = [
    { zone: 0, x: 21, y: 8, name: 'Dr. Data', emoji: '👨‍🔬', dialogue: [
        { text: "Welcome to the digital world! I'm Dr. Data, a researcher of digital creatures!", next: 1 },
        { text: "These creatures are born from data. They grow, evolve, and battle!", next: 2 },
        { text: "Would you like to choose your first digital partner?", choices: ['Yes please!','Tell me more'], next: [3, 4] },
        { text: "Choose wisely! Each one has unique evolution paths!", action: 'choose_starter', next: null },
        { text: "There are 10 types of creatures. Fire beats Nature, Ice beats Water, and so on. Each creature can digivolve into stronger forms!", next: 5 },
        { text: "From Baby to Rookie to Champion to Ultimate to Mega — five evolution stages! Ready to pick?", choices: ['Yes!','Not yet'], next: [3, null] },
    ]},
    { zone: 0, x: 5, y: 7, name: 'Mom', emoji: '👩', dialogue: [
        { text: "Good morning! Dr. Data is waiting in his lab to the east! 💕", next: 1 },
        { text: "Visit the Digi-Center if your creatures get hurt!", next: null },
    ]},
    { zone: 0, x: 5, y: 19, name: 'Shop', emoji: '🧑‍💼', dialogue: [
        { text: "Welcome to the Digi-Mart!", action: 'shop', shop: ['potion','super_potion','digi_egg','revive'], next: null },
    ]},
    { zone: 0, x: 21, y: 19, name: 'Nurse', emoji: '👩‍⚕️', dialogue: [
        { text: "Welcome to the Digi-Center! Let me heal your creatures!", next: 1 },
        { text: "... ✨ All your digital creatures are fully restored! ✨", action: 'heal', next: null },
    ]},
    { zone: 0, x: 15, y: 8, name: 'Elder', emoji: '👴', dialogue: [
        { text: "In the old days, digital creatures were just data packets...", next: 1 },
        { text: "Now they have feelings, dreams, and incredible power!", next: 2 },
        { text: "Walk through the tall data-grass to find wild creatures. Good luck!", next: null },
    ]},
    { zone: 0, x: 12, y: 13, name: 'Sign', emoji: '🪧', isSign: true, dialogue: [
        { text: "↑ Dr. Data's Lab  ↓ Pond\n← Home  → Data Route", next: null }
    ]},

    { zone: 1, x: 15, y: 9, name: 'Tamer Kai', emoji: '🧑', dialogue: [
        { text: "Hey! You've got creatures too? Let's battle!", action: 'battle',
          team: [createCreature(27, 5), createCreature(29, 6)], next: null },
    ], defeated: false, defeatMsg: "You're strong! Keep going east to Circuit City!" },
    { zone: 1, x: 28, y: 6, name: 'Tamer Luna', emoji: '👧', dialogue: [
        { text: "I love training! Battle me!", action: 'battle',
          team: [createCreature(24, 6), createCreature(18, 7)], next: null },
    ], defeated: false, defeatMsg: "Amazing! Stronger tamers await ahead!" },
    { zone: 1, x: 3, y: 10, name: 'Sign', emoji: '🪧', isSign: true, dialogue: [
        { text: "Data Route\n← Byte Village  → Circuit City\nWatch for wild creatures!", next: null }
    ]},

    { zone: 2, x: 6, y: 9, name: 'Arena Master Volt', emoji: '⚡', dialogue: [
        { text: "I am Volt, the Electric Arena Master! Ready?", choices: ['Bring it!','Not ready'], next: [1, null] },
        { text: "Let's go!", action: 'battle',
          team: [createCreature(15, 12), createCreature(16, 14), createCreature(15, 13)], badge: 'Thunder Crest', next: null },
    ], defeated: false, defeatMsg: "You've earned the Thunder Crest! ⚡" },
    { zone: 2, x: 25, y: 9, name: 'Shop', emoji: '🧑‍💼', dialogue: [
        { text: "Premium Digi-Shop!", action: 'shop', shop: ['potion','super_potion','max_potion','digi_egg','golden_egg','revive','atk_chip'], next: null },
    ]},
    { zone: 2, x: 6, y: 21, name: 'Nurse', emoji: '👩‍⚕️', dialogue: [
        { text: "Your creatures look tired! Let me fix them!", next: 1 },
        { text: "... ✨ All healed! ✨", action: 'heal', next: null },
    ]},
    { zone: 2, x: 16, y: 10, name: 'Sign', emoji: '🪧', isSign: true, dialogue: [
        { text: "Circuit City — City of Digital Dreams!\n↑ Arena  ↓ Data Cavern\n← Data Route  → Pixel Beach", next: null }
    ]},
    { zone: 2, x: 13, y: 26, name: 'Kid', emoji: '👦', dialogue: [
        { text: "Did you know? Creatures can digivolve through 5 stages — all the way to Mega!", next: 1 },
        { text: "Baby → Rookie → Champion → Ultimate → Mega! Keep training! 😄", next: null },
    ]},

    { zone: 3, x: 15, y: 12, name: 'Explorer', emoji: '🧗', dialogue: [
        { text: "These caves have rare dark & star creatures! Battle me to warm up?", choices: ['Sure!','No thanks'], next: [1, null] },
        { text: "Here we go!", action: 'battle',
          team: [createCreature(21, 10), createCreature(31, 11), createCreature(27, 12)], next: null },
    ], defeated: false, defeatMsg: "Great battle! Check the cave corners for chests!" },

    { zone: 4, x: 19, y: 8, name: 'Surfer', emoji: '🏄', dialogue: [
        { text: "Cowabunga! Battle?", choices: ['Yeah!','Nah'], next: [1, null] },
        { text: "Radical!", action: 'battle',
          team: [createCreature(18, 14), createCreature(19, 16), createCreature(29, 15)], next: null },
    ], defeated: false, defeatMsg: "Tubular battle!" },

    { zone: 5, x: 14, y: 10, name: 'Arena Master Terra', emoji: '⛰️', dialogue: [
        { text: "I am Terra! You need the Thunder Crest to challenge me.", choices: ['I have it!','Not yet...'], next: [1, null] },
        { text: "Prepare yourself!", action: 'battle',
          team: [createCreature(28, 22), createCreature(17, 24), createCreature(28, 25), createCreature(15, 23)], badge: 'Mountain Crest', next: null },
    ], defeated: false, defeatMsg: "Take the Mountain Crest! ⛰️" },

    { zone: 6, x: 16, y: 12, name: 'Arena Master Nyx', emoji: '🌙', dialogue: [
        { text: "The shadows whisper... I am Nyx. Dare you challenge darkness?", choices: ['I dare!','I need prep'], next: [1, null] },
        { text: "Then face the void!", action: 'battle',
          team: [createCreature(22, 28), createCreature(33, 27), createCreature(23, 30), createCreature(21, 29)], badge: 'Shadow Crest', next: null },
    ], defeated: false, defeatMsg: "The shadows bow to you. Take the Shadow Crest! 🌙" },

    { zone: 7, x: 12, y: 10, name: 'Champion Nova', emoji: '👑', dialogue: [
        { text: "You've earned all three crests... I am Nova, the Digital Champion!", next: 1 },
        { text: "This is the ultimate battle! Ready?", choices: ['Born ready!','Let me prepare'], next: [2, null] },
        { text: "Let's make this LEGENDARY! 🌟", action: 'battle',
          team: [createCreature(4, 35), createCreature(9, 34), createCreature(14, 33), createCreature(33, 35), createCreature(17, 34), createCreature(23, 36)],
          badge: 'Champion Crown', next: null },
    ], defeated: false, defeatMsg: "Incredible! You are the new DIGITAL CHAMPION! 👑🎉" },
    { zone: 7, x: 5, y: 21, name: 'Nurse', emoji: '👩‍⚕️', dialogue: [
        { text: "Champion's Digi-Center. Let me restore your team!", next: 1 },
        { text: "... ✨ Fully restored! ✨", action: 'heal', next: null },
    ]},
    { zone: 7, x: 18, y: 21, name: 'Elite Shop', emoji: '🧑‍💼', dialogue: [
        { text: "Elite Shop!", action: 'shop',
          shop: ['max_potion','prism_egg','revive','atk_chip','def_chip','spd_chip'], next: null },
    ]},
    { zone: 7, x: 12, y: 11, name: 'Sign', emoji: '🪧', isSign: true, dialogue: [
        { text: "Final Arena — Only the worthy may enter! 👑", next: null }
    ]},
];

// ── Quests ───────────────────────────────────────────────────
const QUESTS = [
    { id: 'q_starter', name: 'Digital Partner', desc: 'Get your first digital creature.', reward: { gold: 200 }, check: gs => gs.team.length > 0 },
    { id: 'q_catch5', name: 'Collector', desc: 'Catch 5 different species.', reward: { gold: 500, item: { id: 'golden_egg', qty: 5 } }, check: gs => new Set(gs.team.map(t => t.speciesId)).size >= 5 },
    { id: 'q_catch10', name: 'Data Hoarder', desc: 'Catch 10 different species!', reward: { gold: 1000, item: { id: 'prism_egg', qty: 3 } }, check: gs => new Set(gs.team.map(t => t.speciesId)).size >= 10 },
    { id: 'q_badge1', name: 'Thunder Crest', desc: 'Defeat Arena Master Volt.', reward: { gold: 800 }, check: gs => gs.badges.includes('Thunder Crest') },
    { id: 'q_badge2', name: 'Mountain Crest', desc: 'Defeat Arena Master Terra.', reward: { gold: 1200 }, check: gs => gs.badges.includes('Mountain Crest') },
    { id: 'q_badge3', name: 'Shadow Crest', desc: 'Defeat Arena Master Nyx.', reward: { gold: 1500 }, check: gs => gs.badges.includes('Shadow Crest') },
    { id: 'q_champion', name: 'Digital Champion!', desc: 'Defeat Champion Nova!', reward: { gold: 5000 }, check: gs => gs.badges.includes('Champion Crown') },
    { id: 'q_evolve', name: 'First Digivolution!', desc: 'Digivolve a creature.', reward: { gold: 400 }, check: gs => gs.evolved },
    { id: 'q_lvl20', name: 'Veteran Tamer', desc: 'Reach level 20.', reward: { gold: 600, item: { id: 'super_potion', qty: 5 } }, check: gs => gs.team.some(t => t.level >= 20) },
    { id: 'q_mega', name: 'Mega Evolution!', desc: 'Reach Mega stage!', reward: { gold: 3000 }, check: gs => gs.team.some(t => t.species.stage >= 4) },
];

// ── Game State ──────────────────────────────────────────────
let GS = {
    screen: 'title',
    player: { x: 14 * TILE, y: 10 * TILE, dir: 'down', moving: false, frame: 0, stepCooldown: 0 },
    zone: 0, team: [], box: [], bag: { potion: 3, digi_egg: 5 },
    gold: 500, badges: [], questsDone: [], flags: {}, evolved: false,
    chestsOpened: {}, trainersDefeated: {}, battleCount: 0, playTime: 0,
    battle: null, dialogue: null, menu: { cursor: 0 }, shop: null,
    cam: { x: 0, y: 0 },
    transition: { active: false, alpha: 0, phase: null, callback: null },
    particles: [], notifications: [], shake: { x: 0, y: 0, intensity: 0 },
    dayNightCycle: 0
};

let gameStarted = false;
function startGameIfNeeded() {
    if (!gameStarted) { gameStarted = true; requestAnimationFrame(gameLoop); }
}

// ── Input ───────────────────────────────────────────────────
const keys = {};
let touchDirs = {};
document.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; ensureAudio(); e.preventDefault(); });
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
document.querySelectorAll('.dpad-btn').forEach(btn => {
    const dir = btn.dataset.dir;
    const start = e => { e.preventDefault(); touchDirs[dir] = true; ensureAudio(); };
    const end = e => { e.preventDefault(); touchDirs[dir] = false; };
    btn.addEventListener('touchstart', start); btn.addEventListener('touchend', end);
    btn.addEventListener('mousedown', start); btn.addEventListener('mouseup', end);
});
let btnAPressed = false, btnBPressed = false;
const btnAEl = document.getElementById('btnA');
const btnBEl = document.getElementById('btnB');
if (btnAEl) { btnAEl.addEventListener('touchstart', e => { e.preventDefault(); btnAPressed = true; ensureAudio(); }); btnAEl.addEventListener('touchend', e => { e.preventDefault(); btnAPressed = false; }); btnAEl.addEventListener('mousedown', () => { btnAPressed = true; ensureAudio(); }); btnAEl.addEventListener('mouseup', () => btnAPressed = false); }
if (btnBEl) { btnBEl.addEventListener('touchstart', e => { e.preventDefault(); btnBPressed = true; ensureAudio(); }); btnBEl.addEventListener('touchend', e => { e.preventDefault(); btnBPressed = false; }); btnBEl.addEventListener('mousedown', () => { btnBPressed = true; ensureAudio(); }); btnBEl.addEventListener('mouseup', () => btnBPressed = false); }

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
function actionJustPressed() { return actionPressed() && !lastAction; }
function cancelJustPressed() { return cancelPressed() && !lastCancel; }

// ── Drawing Helpers ─────────────────────────────────────────
function drawRoundRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}
function drawBar(x, y, w, h, pct, color, bg = '#333') {
    drawRoundRect(x, y, w, h, h/2, bg);
    if (pct > 0) drawRoundRect(x, y, Math.max(w * pct, h), h, h/2, color);
}
function addParticle(x, y, color, life, vx, vy, size) {
    GS.particles.push({ x, y, color, life, maxLife: life, vx: vx || (Math.random()-0.5)*3, vy: vy || (Math.random()-0.5)*3, size: size || 4 });
}
function addNotification(text, dur = 3000) { GS.notifications.push({ text, time: dur, maxTime: dur }); }
function screenShake(i) { GS.shake.intensity = i; }
function startTransition(cb) { GS.transition = { active: true, alpha: 0, phase: 'out', callback: cb }; }
function wrapText(text, maxW) {
    const words = text.split(' '); const lines = []; let cur = '';
    ctx.font = '16px Fredoka One, cursive';
    words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW) { if (cur) lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    const result = []; lines.forEach(l => result.push(...l.split('\n'))); return result;
}

// ── Draw Cute Digital Creature ──────────────────────────────
function drawCreature(x, y, sp, size, time, hp, maxHp) {
    const t = time || Date.now();
    const bobY = Math.sin(t / 300) * 3;
    const blink = Math.sin(t / 2000) > 0.95;
    const bodyColor = sp.bodyColor || sp.color;
    const accent = sp.accentColor || '#fff';
    const stage = sp.stage || 0;
    const sizeM = 1 + stage * 0.15;
    const sz = size * sizeM;

    ctx.save();
    ctx.translate(x, y + bobY);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, sz * 0.65, sz * 0.6, sz * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Aura glow for higher stages
    if (stage >= 2) {
        const glow = ctx.createRadialGradient(0, 0, sz * 0.3, 0, 0, sz * 1.2);
        glow.addColorStop(0, sp.color + '22');
        glow.addColorStop(1, sp.color + '00');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, sz * 1.2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Digital particles for mega
    if (stage >= 4) {
        for (let i = 0; i < 4; i++) {
            const px = Math.sin(t / 300 + i * 1.5) * sz * 0.8;
            const py = Math.cos(t / 400 + i * 1.5) * sz * 0.5;
            ctx.fillStyle = accent + '88';
            ctx.fillRect(px - 2, py - 2, 4, 4);
        }
    }

    // Body shape based on type
    const body = sp.body || 'round';
    ctx.fillStyle = bodyColor;

    if (body === 'round' || body === 'cat') {
        ctx.beginPath();
        ctx.ellipse(0, 0, sz * 0.55, sz * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
    } else if (body === 'wolf' || body === 'raptor') {
        ctx.beginPath();
        ctx.ellipse(0, sz * 0.05, sz * 0.6, sz * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        // Snout
        ctx.beginPath();
        ctx.ellipse(sz * 0.35, sz * 0.05, sz * 0.2, sz * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
    } else if (body === 'dragon' || body === 'serpent') {
        ctx.beginPath();
        ctx.moveTo(0, -sz * 0.55);
        ctx.quadraticCurveTo(-sz * 0.6, -sz * 0.1, -sz * 0.5, sz * 0.3);
        ctx.quadraticCurveTo(0, sz * 0.6, sz * 0.5, sz * 0.3);
        ctx.quadraticCurveTo(sz * 0.6, -sz * 0.1, 0, -sz * 0.55);
        ctx.fill();
        // Wings
        ctx.fillStyle = accent + '88';
        ctx.beginPath();
        ctx.moveTo(-sz * 0.4, -sz * 0.1);
        ctx.lineTo(-sz * 0.9, -sz * 0.5 + Math.sin(t / 200) * 5);
        ctx.lineTo(-sz * 0.3, sz * 0.1);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(sz * 0.4, -sz * 0.1);
        ctx.lineTo(sz * 0.9, -sz * 0.5 + Math.sin(t / 200 + 1) * 5);
        ctx.lineTo(sz * 0.3, sz * 0.1);
        ctx.fill();
        ctx.fillStyle = bodyColor;
    } else if (body === 'bird') {
        ctx.beginPath();
        ctx.ellipse(0, 0, sz * 0.45, sz * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Wings
        ctx.fillStyle = accent;
        const wingF = Math.sin(t / 150) * 10;
        ctx.beginPath();
        ctx.moveTo(-sz * 0.3, 0);
        ctx.lineTo(-sz * 0.8, -sz * 0.4 + wingF);
        ctx.lineTo(-sz * 0.2, sz * 0.1);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(sz * 0.3, 0);
        ctx.lineTo(sz * 0.8, -sz * 0.4 + wingF);
        ctx.lineTo(sz * 0.2, sz * 0.1);
        ctx.fill();
        ctx.fillStyle = bodyColor;
    } else if (body === 'angel') {
        ctx.beginPath();
        ctx.ellipse(0, 0, sz * 0.5, sz * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        // Angel wings
        ctx.fillStyle = '#ffeecc88';
        const wingF2 = Math.sin(t / 200) * 8;
        ctx.beginPath();
        ctx.moveTo(-sz * 0.35, -sz * 0.1);
        ctx.quadraticCurveTo(-sz * 0.9, -sz * 0.7 + wingF2, -sz * 0.4, -sz * 0.5);
        ctx.quadraticCurveTo(-sz * 0.7, sz * 0.1, -sz * 0.2, sz * 0.1);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(sz * 0.35, -sz * 0.1);
        ctx.quadraticCurveTo(sz * 0.9, -sz * 0.7 + wingF2, sz * 0.4, -sz * 0.5);
        ctx.quadraticCurveTo(sz * 0.7, sz * 0.1, sz * 0.2, sz * 0.1);
        ctx.fill();
        // Halo
        ctx.strokeStyle = '#ffee88';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, -sz * 0.6, sz * 0.2, sz * 0.06, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = bodyColor;
    } else if (body === 'titan' || body === 'reaper') {
        ctx.beginPath();
        ctx.moveTo(0, -sz * 0.6);
        ctx.lineTo(-sz * 0.5, -sz * 0.2);
        ctx.lineTo(-sz * 0.6, sz * 0.3);
        ctx.quadraticCurveTo(0, sz * 0.7, sz * 0.6, sz * 0.3);
        ctx.lineTo(sz * 0.5, -sz * 0.2);
        ctx.closePath();
        ctx.fill();
        // Armor plates
        ctx.fillStyle = accent + '44';
        ctx.fillRect(-sz * 0.35, -sz * 0.1, sz * 0.7, sz * 0.08);
        ctx.fillRect(-sz * 0.3, sz * 0.1, sz * 0.6, sz * 0.06);
        ctx.fillStyle = bodyColor;
    }

    // Ears/horns
    const ears = sp.ears || 'pointy';
    ctx.fillStyle = accent;
    if (ears === 'pointy' || ears === 'cat' || ears === 'wolf') {
        ctx.beginPath();
        ctx.moveTo(-sz * 0.25, -sz * 0.4);
        ctx.lineTo(-sz * 0.4, -sz * 0.7);
        ctx.lineTo(-sz * 0.1, -sz * 0.45);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(sz * 0.25, -sz * 0.4);
        ctx.lineTo(sz * 0.4, -sz * 0.7);
        ctx.lineTo(sz * 0.1, -sz * 0.45);
        ctx.fill();
    } else if (ears === 'horns') {
        ctx.beginPath();
        ctx.moveTo(-sz * 0.3, -sz * 0.4);
        ctx.quadraticCurveTo(-sz * 0.6, -sz * 0.9, -sz * 0.1, -sz * 0.5);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(sz * 0.3, -sz * 0.4);
        ctx.quadraticCurveTo(sz * 0.6, -sz * 0.9, sz * 0.1, -sz * 0.5);
        ctx.fill();
    } else if (ears === 'leaf') {
        ctx.fillStyle = '#88dd44';
        ctx.beginPath();
        ctx.ellipse(-sz * 0.2, -sz * 0.55, sz * 0.15, sz * 0.08, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(sz * 0.2, -sz * 0.55, sz * 0.15, sz * 0.08, 0.5, 0, Math.PI * 2);
        ctx.fill();
    } else if (ears === 'fin') {
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(0, -sz * 0.45);
        ctx.lineTo(-sz * 0.1, -sz * 0.7);
        ctx.lineTo(sz * 0.1, -sz * 0.7);
        ctx.closePath();
        ctx.fill();
    } else if (ears === 'bat') {
        ctx.fillStyle = '#6644aa';
        ctx.beginPath();
        ctx.moveTo(-sz * 0.25, -sz * 0.35);
        ctx.lineTo(-sz * 0.5, -sz * 0.8);
        ctx.lineTo(-sz * 0.3, -sz * 0.6);
        ctx.lineTo(-sz * 0.1, -sz * 0.75);
        ctx.lineTo(-sz * 0.05, -sz * 0.4);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(sz * 0.25, -sz * 0.35);
        ctx.lineTo(sz * 0.5, -sz * 0.8);
        ctx.lineTo(sz * 0.3, -sz * 0.6);
        ctx.lineTo(sz * 0.1, -sz * 0.75);
        ctx.lineTo(sz * 0.05, -sz * 0.4);
        ctx.fill();
    } else if (ears === 'star') {
        ctx.fillStyle = '#ff88cc';
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const sx2 = Math.cos(a) * sz * 0.12;
            const sy2 = Math.sin(a) * sz * 0.12 - sz * 0.55;
            ctx.beginPath();
            ctx.arc(sx2, sy2, sz * 0.06, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (ears === 'crown') {
        ctx.fillStyle = '#ffdd44';
        ctx.beginPath();
        ctx.moveTo(-sz * 0.3, -sz * 0.5);
        ctx.lineTo(-sz * 0.25, -sz * 0.75);
        ctx.lineTo(-sz * 0.1, -sz * 0.6);
        ctx.lineTo(0, -sz * 0.8);
        ctx.lineTo(sz * 0.1, -sz * 0.6);
        ctx.lineTo(sz * 0.25, -sz * 0.75);
        ctx.lineTo(sz * 0.3, -sz * 0.5);
        ctx.closePath();
        ctx.fill();
    }

    // Tail
    const tail = sp.tail || 'short';
    if (tail === 'flame') {
        ctx.fillStyle = '#ff8833';
        const flicker = Math.sin(t / 80) * 3;
        ctx.beginPath();
        ctx.moveTo(-sz * 0.5, sz * 0.15);
        ctx.quadraticCurveTo(-sz * 0.8, sz * 0.05 + flicker, -sz * 0.7, -sz * 0.15);
        ctx.quadraticCurveTo(-sz * 0.6, sz * 0.1, -sz * 0.4, sz * 0.2);
        ctx.fill();
        ctx.fillStyle = '#ffcc44';
        ctx.beginPath();
        ctx.arc(-sz * 0.65, -sz * 0.05, sz * 0.08, 0, Math.PI * 2);
        ctx.fill();
    } else if (tail === 'fluffy') {
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.ellipse(-sz * 0.55, sz * 0.15, sz * 0.2, sz * 0.15, -0.3, 0, Math.PI * 2);
        ctx.fill();
    } else if (tail === 'vine') {
        ctx.strokeStyle = '#55aa33';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-sz * 0.45, sz * 0.1);
        ctx.quadraticCurveTo(-sz * 0.7, sz * 0.3 + Math.sin(t / 300) * 5, -sz * 0.6, sz * 0.0);
        ctx.stroke();
    } else if (tail === 'bolt') {
        ctx.fillStyle = '#ffdd22';
        ctx.beginPath();
        ctx.moveTo(-sz * 0.4, sz * 0.1);
        ctx.lineTo(-sz * 0.6, sz * 0.0);
        ctx.lineTo(-sz * 0.5, sz * 0.15);
        ctx.lineTo(-sz * 0.75, sz * 0.1);
        ctx.lineTo(-sz * 0.5, sz * 0.25);
        ctx.lineTo(-sz * 0.35, sz * 0.2);
        ctx.closePath();
        ctx.fill();
    } else if (tail === 'shadow') {
        ctx.fillStyle = '#4422aa44';
        ctx.beginPath();
        ctx.moveTo(-sz * 0.45, sz * 0.1);
        ctx.quadraticCurveTo(-sz * 0.8, -sz * 0.1 + Math.sin(t / 250) * 8, -sz * 0.6, sz * 0.3);
        ctx.quadraticCurveTo(-sz * 0.5, sz * 0.2, -sz * 0.4, sz * 0.15);
        ctx.fill();
    } else if (tail === 'star') {
        ctx.fillStyle = '#ff88cc';
        const sx3 = -sz * 0.55 + Math.sin(t / 400) * 3;
        const sy3 = sz * 0.1;
        ctx.beginPath();
        ctx.arc(sx3, sy3, sz * 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffaadd';
        ctx.beginPath();
        ctx.arc(sx3, sy3, sz * 0.05, 0, Math.PI * 2);
        ctx.fill();
    }

    // Eyes
    const faceY = -sz * 0.05;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-sz * 0.18, faceY, sz * 0.11, blink ? 1 : sz * 0.13, 0, 0, Math.PI * 2);
    ctx.ellipse(sz * 0.18, faceY, sz * 0.11, blink ? 1 : sz * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!blink) {
        ctx.fillStyle = sp.type === 'dark' ? '#cc44ff' : sp.type === 'fire' ? '#ff4400' : '#222';
        ctx.beginPath();
        ctx.arc(-sz * 0.18, faceY + 2, sz * 0.055, 0, Math.PI * 2);
        ctx.arc(sz * 0.18, faceY + 2, sz * 0.055, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-sz * 0.21, faceY - 1, sz * 0.025, 0, Math.PI * 2);
        ctx.arc(sz * 0.15, faceY - 1, sz * 0.025, 0, Math.PI * 2);
        ctx.fill();
    }

    // Mouth
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    if (hp !== undefined && hp < maxHp * 0.3) {
        ctx.beginPath(); ctx.arc(0, faceY + sz * 0.22, sz * 0.08, Math.PI, 0); ctx.stroke();
    } else {
        ctx.beginPath(); ctx.arc(0, faceY + sz * 0.14, sz * 0.1, 0, Math.PI); ctx.stroke();
    }

    // Blush
    ctx.fillStyle = 'rgba(255,140,140,0.35)';
    ctx.beginPath();
    ctx.ellipse(-sz * 0.32, faceY + sz * 0.1, sz * 0.07, sz * 0.04, 0, 0, Math.PI * 2);
    ctx.ellipse(sz * 0.32, faceY + sz * 0.1, sz * 0.07, sz * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stage indicator
    ctx.fillStyle = STAGE_COLORS[stage] || '#aaa';
    ctx.font = `${Math.floor(sz * 0.2)}px Fredoka One, cursive`;
    ctx.textAlign = 'center';
    ctx.fillText(STAGES[stage], 0, sz * 0.55);

    // Type emoji
    ctx.font = `${Math.floor(sz * 0.3)}px sans-serif`;
    ctx.fillText(TYPE_EMOJI[sp.type], 0, -sz * 0.55 - 4);

    ctx.restore();
}

// ── Draw Tile ───────────────────────────────────────────────
function drawTile(tileType, sx, sy, time) {
    ctx.fillStyle = TILE_COLORS[tileType] || '#000';
    ctx.fillRect(sx, sy, TILE, TILE);
    switch (tileType) {
        case T.GRASS:
            ctx.fillStyle = '#3da83d';
            for (let i = 0; i < 3; i++) ctx.fillRect(sx+8+i*14, sy+30+Math.sin(time/500+i)*2, 2, 8);
            break;
        case T.TALL_GRASS:
            ctx.fillStyle = '#257a25';
            for (let i = 0; i < 5; i++) { ctx.fillRect(sx+4+i*9, sy+15+Math.sin(time/400+i)*3, 3, 20); ctx.fillRect(sx+2+i*9, sy+15+Math.sin(time/400+i)*3, 7, 2); }
            break;
        case T.DARK_GRASS:
            ctx.fillStyle = '#145a14';
            for (let i = 0; i < 5; i++) { ctx.fillRect(sx+4+i*9, sy+12+Math.sin(time/350+i)*4, 3, 24); ctx.fillRect(sx+1+i*9, sy+14+Math.sin(time/350+i)*4, 9, 2); }
            break;
        case T.WATER:
            ctx.fillStyle = '#5aaae8';
            ctx.fillRect(sx+4, sy+12+Math.sin(time/600)*3, 18, 3);
            ctx.fillRect(sx+24, sy+28+Math.sin(time/500+2)*3, 16, 3);
            break;
        case T.TREE:
            ctx.fillStyle = '#5a3a1a'; ctx.fillRect(sx+18, sy+28, 12, 20);
            ctx.fillStyle = '#1a7a3a'; ctx.beginPath(); ctx.arc(sx+24, sy+20, 18, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#2d8a4e'; ctx.beginPath(); ctx.arc(sx+20, sy+16, 12, 0, Math.PI*2); ctx.fill();
            break;
        case T.FLOWER:
            ctx.fillStyle = '#3da83d'; ctx.fillRect(sx, sy, TILE, TILE);
            const fc = ['#ff6688','#ffaa44','#ff88dd','#88aaff','#ffff66'][(Math.floor(sx/TILE)+Math.floor(sy/TILE))%5];
            ctx.fillStyle = fc; ctx.beginPath(); ctx.arc(sx+24+Math.sin(time/700)*2, sy+24, 6, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#ffee55'; ctx.beginPath(); ctx.arc(sx+24+Math.sin(time/700)*2, sy+24, 3, 0, Math.PI*2); ctx.fill();
            break;
        case T.BUILDING:
            ctx.fillStyle = '#a08060'; ctx.fillRect(sx+2, sy+2, TILE-4, TILE-4);
            ctx.fillStyle = '#705030'; ctx.fillRect(sx+4, sy+4, TILE-8, 4);
            ctx.fillStyle = '#80c8ff'; ctx.fillRect(sx+12, sy+14, 10, 10); ctx.fillRect(sx+26, sy+14, 10, 10);
            break;
        case T.DOOR:
            ctx.fillStyle = '#c8a868'; ctx.fillRect(sx, sy, TILE, TILE);
            ctx.fillStyle = '#6a3a1a'; ctx.fillRect(sx+14, sy+4, 20, TILE-4);
            ctx.fillStyle = '#ffdd44'; ctx.beginPath(); ctx.arc(sx+30, sy+24, 3, 0, Math.PI*2); ctx.fill();
            break;
        case T.FENCE:
            ctx.fillStyle = '#4ab84a'; ctx.fillRect(sx, sy, TILE, TILE);
            ctx.fillStyle = '#b08050'; ctx.fillRect(sx, sy+16, TILE, 4); ctx.fillRect(sx, sy+30, TILE, 4);
            ctx.fillRect(sx+8, sy+12, 4, 26); ctx.fillRect(sx+36, sy+12, 4, 26);
            break;
        case T.BRIDGE:
            ctx.fillStyle = '#b88608'; ctx.fillRect(sx+2, sy, TILE-4, TILE);
            ctx.fillStyle = '#daa520'; ctx.fillRect(sx+6, sy, 4, TILE); ctx.fillRect(sx+TILE-10, sy, 4, TILE);
            break;
        case T.SIGN:
            ctx.fillStyle = '#c8a868'; ctx.fillRect(sx, sy, TILE, TILE);
            ctx.fillStyle = '#8b5a2b'; ctx.fillRect(sx+18, sy+28, 12, 16);
            ctx.fillStyle = '#daa520'; ctx.fillRect(sx+10, sy+10, 28, 20);
            ctx.fillStyle = '#8b5a2b'; ctx.fillRect(sx+14, sy+16, 20, 2); ctx.fillRect(sx+14, sy+22, 16, 2);
            break;
        case T.CAVE_FLOOR:
            ctx.fillStyle = '#3a3a3a'; ctx.fillRect(sx+10, sy+8, 4, 4); ctx.fillRect(sx+30, sy+32, 6, 4);
            break;
        case T.CAVE_WALL:
            ctx.fillStyle = '#1a1a1a'; ctx.fillRect(sx+2, sy+2, TILE-4, TILE-4);
            ctx.fillStyle = '#2a2a2a'; ctx.fillRect(sx+6, sy+6, 12, 8); ctx.fillRect(sx+28, sy+24, 10, 8);
            break;
        case T.CHEST:
            ctx.fillStyle = '#c8a868'; ctx.fillRect(sx, sy, TILE, TILE);
            ctx.fillStyle = '#8B6914'; ctx.fillRect(sx+10, sy+16, 28, 22);
            ctx.fillStyle = '#B8860B'; ctx.fillRect(sx+12, sy+18, 24, 18);
            ctx.fillStyle = '#FFD700'; ctx.fillRect(sx+20, sy+24, 8, 6);
            break;
        case T.DIGITAL:
            // Grid pattern
            ctx.strokeStyle = '#2a2a5a'; ctx.lineWidth = 1;
            ctx.strokeRect(sx, sy, TILE, TILE);
            if ((Math.floor(sx/TILE)+Math.floor(sy/TILE)) % 3 === 0) {
                ctx.fillStyle = '#2a2a4a'; ctx.fillRect(sx+TILE/2-2, sy+TILE/2-2, 4, 4);
            }
            break;
        case T.LAVA:
            ctx.fillStyle = '#dd3311' + (Math.sin(time/300) > 0 ? 'ff' : 'cc');
            ctx.fillRect(sx+4, sy+10+Math.sin(time/400)*2, 12, 4);
            ctx.fillRect(sx+24, sy+22+Math.sin(time/350+1)*2, 14, 4);
            break;
    }
}

// ── Draw Player ─────────────────────────────────────────────
function drawPlayer(px, py, dir, frame, time) {
    ctx.save();
    ctx.translate(px+TILE/2, py+TILE/2);
    const bobY = Math.sin(time/200+frame) * (GS.player.moving ? 3 : 1);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 18, 14, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#4a90d9'; ctx.beginPath(); ctx.arc(0, 4+bobY, 14, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffcc99'; ctx.beginPath(); ctx.arc(0, -10+bobY, 12, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#5a3a1a'; ctx.beginPath(); ctx.arc(0, -16+bobY, 12, Math.PI, 0); ctx.fill(); ctx.fillRect(-12, -16+bobY, 24, 4);
    // Goggles (digital tamer style)
    ctx.fillStyle = '#44aaff'; ctx.fillRect(-10, -14+bobY, 8, 5); ctx.fillRect(2, -14+bobY, 8, 5);
    ctx.fillStyle = '#88ddff'; ctx.fillRect(-9, -13+bobY, 6, 3); ctx.fillRect(3, -13+bobY, 6, 3);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.strokeRect(-10, -14+bobY, 8, 5); ctx.strokeRect(2, -14+bobY, 8, 5);
    const eyeOff = dir === 'left' ? -3 : dir === 'right' ? 3 : 0;
    const eyeYOff = dir === 'up' ? -2 : dir === 'down' ? 2 : 0;
    const blink = Math.sin(time/3000) > 0.97;
    if (dir !== 'up') {
        ctx.fillStyle = '#222';
        if (!blink) {
            ctx.beginPath(); ctx.arc(-4+eyeOff, -10+eyeYOff+bobY, 2, 0, Math.PI*2); ctx.arc(4+eyeOff, -10+eyeYOff+bobY, 2, 0, Math.PI*2); ctx.fill();
        }
        ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(eyeOff*0.5, -6+bobY, 4, 0.1, Math.PI-0.1); ctx.stroke();
    }
    ctx.fillStyle = '#336699';
    if (GS.player.moving) { const l = Math.sin(time/100)*5; ctx.fillRect(-6, 16+bobY, 5, 8+l); ctx.fillRect(1, 16+bobY, 5, 8-l); }
    else { ctx.fillRect(-6, 16+bobY, 5, 8); ctx.fillRect(1, 16+bobY, 5, 8); }
    ctx.fillStyle = '#cc3333'; ctx.fillRect(-7, 23+bobY, 6, 3); ctx.fillRect(1, 23+bobY, 6, 3);
    ctx.restore();
}

// ── Draw NPC ────────────────────────────────────────────────
function drawNPC(npc, sx, sy, time) {
    if (npc.isSign) return;
    ctx.save(); ctx.translate(sx+TILE/2, sy+TILE/2);
    const bobY = Math.sin(time/500+npc.x*7)*2;
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(0, 18, 12, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(npc.emoji, 0, -2+bobY);
    ctx.font = '10px Fredoka One, cursive'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(npc.name, 0, -24+bobY);
    const px2 = GS.player.x/TILE, py2 = GS.player.y/TILE;
    if (Math.abs(px2-npc.x)+Math.abs(py2-npc.y) <= 2) {
        ctx.fillStyle = '#ffdd44'; ctx.font = '14px sans-serif';
        ctx.fillText('!', 0, -34+Math.sin(time/300)*3);
    }
    ctx.restore();
}

function getTile(zone, tx, ty) {
    const map = ZONES[zone].map;
    if (ty < 0 || ty >= map.length || tx < 0 || tx >= map[0].length) return -1;
    return map[ty][tx];
}

// ══════════════════════════════════════════════════════════════
// SCREENS — Title, World, Dialogue, Battle, Menu, Shop, etc.
// (Same architecture as before, rethemed)
// ══════════════════════════════════════════════════════════════
let inputCooldown = 0;

// ── Title ───────────────────────────────────────────────────
function updateTitle() {
    if (actionJustPressed()) {
        sfx('confirm');
        if (GS.team.length > 0) GS.screen = 'world';
        else { GS.screen = 'world'; GS.player = { x: 14*TILE, y: 10*TILE, dir: 'down', moving: false, frame: 0, stepCooldown: 0 }; GS.zone = 0; }
    }
}
function drawTitle(time) {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#0a0a3a'); grad.addColorStop(0.5, '#1a1a5a'); grad.addColorStop(1, '#0a0a2a');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 60; i++) {
        const sx2 = (Math.sin(i*127.1)*0.5+0.5)*canvas.width;
        const sy2 = (Math.cos(i*311.7)*0.5+0.5)*canvas.height*0.6;
        ctx.fillStyle = `rgba(255,255,220,${0.3+Math.sin(time/500+i)*0.3})`;
        ctx.beginPath(); ctx.arc(sx2, sy2, 1.5, 0, Math.PI*2); ctx.fill();
    }
    // Show some creatures
    const showcase = [SPECIES[0], SPECIES[5], SPECIES[10], SPECIES[15], SPECIES[31]];
    showcase.forEach((sp, i) => {
        drawCreature(canvas.width*(0.15+i*0.175), canvas.height*0.38+Math.sin(time/600+i*1.5)*15, sp, 26, time);
    });
    ctx.textAlign = 'center';
    const tg = ctx.createLinearGradient(canvas.width/2-200, 0, canvas.width/2+200, 0);
    tg.addColorStop(0, '#ff5533'); tg.addColorStop(0.25, '#ffcc22'); tg.addColorStop(0.5, '#44dd88'); tg.addColorStop(0.75, '#44aaff'); tg.addColorStop(1, '#dd66ff');
    ctx.fillStyle = tg; ctx.font = 'bold 48px Fredoka One, cursive';
    ctx.fillText('DIGISPIN', canvas.width/2, canvas.height*0.15);
    ctx.fillStyle = '#bbaaee'; ctx.font = '18px Fredoka One, cursive';
    ctx.fillText('Digital Creatures RPG', canvas.width/2, canvas.height*0.22);
    ctx.fillStyle = `rgba(255,255,255,${0.5+Math.sin(time/400)*0.5})`; ctx.font = '20px Fredoka One, cursive';
    ctx.fillText('Press SPACE or TAP to Start', canvas.width/2, canvas.height*0.78);
    ctx.fillStyle = 'rgba(200,200,255,0.5)'; ctx.font = '13px Nunito, cursive';
    ctx.fillText('Arrows/WASD = Move | Z/Space = Action | X/Esc = Menu', canvas.width/2, canvas.height*0.9);
    ctx.fillStyle = `rgba(255,255,255,0.3)`; ctx.font = '11px Nunito, cursive';
    ctx.fillText(currentUser ? `☁️ Logged in — Cloud save enabled` : '💾 Guest — Local save only', canvas.width/2, canvas.height*0.95);
}

// ── World ───────────────────────────────────────────────────
function updateWorld(dt) {
    const p = GS.player; const zone = ZONES[GS.zone]; const map = zone.map;
    if (inputCooldown > 0) { inputCooldown -= dt; return; }
    if (cancelJustPressed()) { sfx('menu'); GS.screen = 'menu'; GS.menu = { cursor: 0 }; inputCooldown = 200; return; }
    let dx = 0, dy = 0;
    if (isDown('up')) { dy = -1; p.dir = 'up'; } else if (isDown('down')) { dy = 1; p.dir = 'down'; }
    else if (isDown('left')) { dx = -1; p.dir = 'left'; } else if (isDown('right')) { dx = 1; p.dir = 'right'; }
    p.moving = dx !== 0 || dy !== 0;
    if (p.moving && p.stepCooldown <= 0) {
        const nx = p.x+dx*TILE, ny = p.y+dy*TILE;
        const tx = Math.floor(nx/TILE), ty = Math.floor(ny/TILE);
        const tile = getTile(GS.zone, tx, ty);
        if (tile >= 0 && WALKABLE.has(tile)) {
            p.x = nx; p.y = ny; p.frame++; p.stepCooldown = 150; sfx('step');
            if ((tile === T.TALL_GRASS || tile === T.DARK_GRASS) && GS.team.length > 0 && Math.random() < ENCOUNTER_CHANCE) {
                const enc = zone.encounters[tile];
                if (enc?.length > 0) { startBattle(createCreature(enc[Math.floor(Math.random()*enc.length)], zone.wildLevels[0]+Math.floor(Math.random()*(zone.wildLevels[1]-zone.wildLevels[0]+1))), true); return; }
            }
            checkZoneExit(tx, ty);
            if (tile === T.CHEST) { const key = `${GS.zone}_${tx}_${ty}`; if (!GS.chestsOpened[key]) { GS.chestsOpened[key] = true; const rw = ['potion','super_potion','digi_egg','golden_egg','revive']; const it = rw[Math.floor(Math.random()*rw.length)]; const q = 1+Math.floor(Math.random()*3); GS.bag[it] = (GS.bag[it]||0)+q; GS.gold += 100+Math.floor(Math.random()*200); addNotification(`Found ${q}x ${ITEMS[it].name} and gold! 🎁`); sfx('catch'); map[ty][tx] = T.PATH; } }
        } else if (tile === -1) checkZoneExit(tx, ty);
        else sfx('bump');
    }
    if (p.stepCooldown > 0) p.stepCooldown -= dt;
    if (actionJustPressed()) {
        const fX = Math.floor(p.x/TILE)+(p.dir==='left'?-1:p.dir==='right'?1:0);
        const fY = Math.floor(p.y/TILE)+(p.dir==='up'?-1:p.dir==='down'?1:0);
        const cX = Math.floor(p.x/TILE), cY = Math.floor(p.y/TILE);
        const npc = NPCS.find(n => n.zone === GS.zone && ((n.x===fX&&n.y===fY)||(n.x===cX&&n.y===cY)));
        if (npc) startDialogue(npc);
    }
    GS.playTime += dt;
    if (Math.floor(GS.playTime/30000) !== Math.floor((GS.playTime-dt)/30000)) saveGame();
    checkQuests();
}

function checkZoneExit(tx, ty) {
    const map = ZONES[GS.zone].map; const w = map[0].length, h = map.length;
    let edge = null;
    if (tx < 0) edge = 'west'; else if (tx >= w) edge = 'east'; else if (ty < 0) edge = 'north'; else if (ty >= h) edge = 'south';
    if (!edge) return;
    const exit = ZONE_EXITS.find(e => e.from === GS.zone && e.edge === edge);
    if (exit) startTransition(() => { GS.zone = exit.to; GS.player.x = exit.toX*TILE; GS.player.y = exit.toY*TILE; addNotification(`📍 ${ZONES[exit.to].name}`); });
    else { GS.player.x = Math.max(0, Math.min((w-1)*TILE, GS.player.x)); GS.player.y = Math.max(0, Math.min((h-1)*TILE, GS.player.y)); }
}

function drawWorld(time) {
    const zone = ZONES[GS.zone]; const map = zone.map; const p = GS.player;
    GS.cam.x = p.x-canvas.width/2+TILE/2; GS.cam.y = p.y-canvas.height/2+TILE/2;
    ctx.save(); ctx.translate(-GS.cam.x+GS.shake.x, -GS.cam.y+GS.shake.y);
    const stx = Math.max(0, Math.floor(GS.cam.x/TILE)-1), sty = Math.max(0, Math.floor(GS.cam.y/TILE)-1);
    const etx = Math.min(map[0].length, Math.ceil((GS.cam.x+canvas.width)/TILE)+1);
    const ety = Math.min(map.length, Math.ceil((GS.cam.y+canvas.height)/TILE)+1);
    for (let ty = sty; ty < ety; ty++) for (let tx = stx; tx < etx; tx++) drawTile(map[ty][tx], tx*TILE, ty*TILE, time);
    NPCS.filter(n => n.zone === GS.zone).forEach(n => drawNPC(n, n.x*TILE, n.y*TILE, time));
    drawPlayer(p.x, p.y, p.dir, p.frame, time);
    ctx.restore();
    // HUD
    drawRoundRect(8, 8, 220, 32, 8, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = '#fff'; ctx.font = '14px Fredoka One, cursive'; ctx.textAlign = 'left';
    ctx.fillText(`📍 ${ZONES[GS.zone].name}`, 16, 30);
    const teamX = canvas.width-52*Math.min(GS.team.length, 6)-8;
    if (GS.team.length > 0) {
        drawRoundRect(teamX-4, 4, 52*Math.min(GS.team.length,6)+8, 50, 8, 'rgba(0,0,0,0.5)');
        GS.team.slice(0,6).forEach((top,i) => {
            const tx2 = teamX+i*52+26;
            ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(TYPE_EMOJI[top.type], tx2, 22);
            const hpPct = top.hp/top.maxHp;
            drawBar(tx2-16, 33, 32, 6, hpPct, hpPct>0.5?'#4d4':hpPct>0.2?'#dd4':'#d44');
            ctx.fillStyle = '#fff'; ctx.font = '8px Nunito, cursive'; ctx.fillText(`L${top.level}`, tx2, 48);
        });
    }
    drawRoundRect(8, 46, 160, 26, 8, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = '#ffdd44'; ctx.font = '13px Fredoka One, cursive'; ctx.textAlign = 'left';
    ctx.fillText(`💰 ${GS.gold}  🏅 ${GS.badges.length}`, 16, 64);
    // Cloud indicator
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '11px Nunito, cursive'; ctx.textAlign = 'right';
    ctx.fillText(currentUser ? '☁️ Cloud' : '💾 Local', canvas.width-10, canvas.height-24);
    ctx.fillText('X/Esc = Menu', canvas.width-10, canvas.height-10);
    // Notifications
    GS.notifications = GS.notifications.filter(n => n.time > 0);
    GS.notifications.forEach((n, i) => {
        n.time -= 16; const alpha = Math.min(1, n.time/500);
        const ny = canvas.height-60-i*40;
        drawRoundRect(canvas.width/2-180, ny, 360, 34, 8, `rgba(0,0,0,${0.7*alpha})`, `rgba(255,255,255,${0.3*alpha})`);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.font = '14px Fredoka One, cursive'; ctx.textAlign = 'center';
        ctx.fillText(n.text, canvas.width/2, ny+22);
    });
}

// ── Dialogue ────────────────────────────────────────────────
function startDialogue(npc) {
    if (npc.defeated && npc.defeatMsg) {
        GS.dialogue = { npc, step: -1, text: '', fullText: npc.defeatMsg, charIndex: 0, typing: true, choices: null, choiceCursor: 0 };
        GS.screen = 'dialogue'; sfx('talk'); inputCooldown = 200; return;
    }
    const step = npc.dialogue[0]; if (!step) return;
    GS.dialogue = { npc, step: 0, text: '', fullText: step.text, charIndex: 0, typing: true, choices: step.choices || null, choiceCursor: 0 };
    GS.screen = 'dialogue'; sfx('talk'); inputCooldown = 200;
}
function updateDialogue(dt) {
    if (inputCooldown > 0) { inputCooldown -= dt; return; }
    const d = GS.dialogue; if (!d) { GS.screen = 'world'; return; }
    if (d.typing) { d.charIndex += 0.5; d.text = d.fullText.substring(0, Math.floor(d.charIndex)); if (d.charIndex >= d.fullText.length) { d.typing = false; d.text = d.fullText; } if (actionJustPressed()) { d.charIndex = d.fullText.length; d.text = d.fullText; d.typing = false; inputCooldown = 150; } return; }
    if (d.choices) {
        if (isDown('up')||isDown('left')) { d.choiceCursor = 0; sfx('select'); inputCooldown = 150; }
        if (isDown('down')||isDown('right')) { d.choiceCursor = Math.min(d.choices.length-1, d.choiceCursor+1); sfx('select'); inputCooldown = 150; }
        if (actionJustPressed()) { sfx('confirm'); const step = d.npc.dialogue[d.step]; const nxt = step.next; if (Array.isArray(nxt)) { const ns = nxt[d.choiceCursor]; if (ns === null) { GS.screen = 'world'; inputCooldown = 200; return; } advanceDialogue(ns); } inputCooldown = 200; } return;
    }
    if (actionJustPressed()||cancelJustPressed()) {
        const step = d.step === -1 ? null : d.npc.dialogue[d.step];
        if (step?.action) { handleDialogueAction(step); return; }
        if (step?.next != null) advanceDialogue(step.next); else { GS.screen = 'world'; inputCooldown = 200; }
    }
}
function advanceDialogue(ns) {
    const d = GS.dialogue; const step = d.npc.dialogue[ns]; if (!step) { GS.screen = 'world'; inputCooldown = 200; return; }
    d.step = ns; d.text = ''; d.fullText = step.text; d.charIndex = 0; d.typing = true; d.choices = step.choices || null; d.choiceCursor = 0;
    if (step.action && ['shop','battle','choose_starter'].includes(step.action)) { d.typing = false; d.text = step.text; d.charIndex = step.text.length; }
    sfx('talk'); inputCooldown = 150;
}
function handleDialogueAction(step) {
    switch (step.action) {
        case 'heal': GS.team.forEach(t => { t.hp = t.maxHp; t.moves.forEach(m => t.movePP[m] = MOVES_DB[m].pp); }); sfx('heal'); addNotification('✨ All creatures healed! ✨'); GS.screen = 'world'; inputCooldown = 300; saveGame(); break;
        case 'shop': GS.screen = 'shop'; GS.shop = { items: step.shop, cursor: 0 }; inputCooldown = 200; break;
        case 'choose_starter': GS.screen = 'starter_select'; GS.starterSelect = { cursor: 0, starters: [0, 5, 10] }; inputCooldown = 200; break;
        case 'battle':
            if (GS.dialogue.npc.defeated) { GS.screen = 'world'; inputCooldown = 200; return; }
            const team = step.team.map(t => createCreature(t.speciesId, t.level));
            startBattle(team, false, GS.dialogue.npc, step.badge); inputCooldown = 300; break;
    }
}
function drawDialogue(time) {
    drawWorld(time); const d = GS.dialogue; if (!d) return;
    const bW = Math.min(600, canvas.width-40), bH = d.choices ? 120+d.choices.length*28 : 100;
    const bX = (canvas.width-bW)/2, bY = canvas.height-bH-20;
    drawRoundRect(bX, bY-30, Math.min(200, d.npc.name.length*14+40), 28, 8, 'rgba(60,40,100,0.95)', '#8866cc');
    ctx.fillStyle = '#ffddaa'; ctx.font = '14px Fredoka One, cursive'; ctx.textAlign = 'left';
    ctx.fillText(`${d.npc.emoji} ${d.npc.name}`, bX+12, bY-10);
    drawRoundRect(bX, bY, bW, bH, 12, 'rgba(20,15,40,0.94)', '#8866cc');
    ctx.fillStyle = '#fff'; ctx.font = '16px Fredoka One, cursive'; ctx.textAlign = 'left';
    wrapText(d.text, bW-40).forEach((l,i) => ctx.fillText(l, bX+20, bY+28+i*24));
    if (d.choices && !d.typing) {
        const lines = wrapText(d.text, bW-40);
        d.choices.forEach((c, i) => {
            const cy = bY+28+lines.length*24+10+i*28;
            if (i === d.choiceCursor) { drawRoundRect(bX+20, cy-14, bW-40, 26, 6, 'rgba(100,80,180,0.6)'); ctx.fillStyle = '#ffdd88'; }
            else ctx.fillStyle = '#aaaacc';
            ctx.fillText(`${i===d.choiceCursor?'▶ ':'  '}${c}`, bX+30, cy+4);
        });
    }
    if (!d.typing && !d.choices) { ctx.fillStyle = `rgba(255,255,255,${Math.sin(time/300)*0.5+0.5})`; ctx.font = '14px sans-serif'; ctx.textAlign = 'right'; ctx.fillText('▼', bX+bW-16, bY+bH-12); }
}

// ── Starter Select ──────────────────────────────────────────
function updateStarterSelect(dt) {
    if (inputCooldown > 0) { inputCooldown -= dt; return; }
    const s = GS.starterSelect;
    if (isDown('left')) { s.cursor = Math.max(0, s.cursor-1); sfx('select'); inputCooldown = 150; }
    if (isDown('right')) { s.cursor = Math.min(2, s.cursor+1); sfx('select'); inputCooldown = 150; }
    if (actionJustPressed()) { sfx('catch'); const c = createCreature(s.starters[s.cursor], 5); GS.team.push(c); addNotification(`You got ${c.name}! 🎉`); GS.screen = 'world'; inputCooldown = 300; saveGame(); }
    if (cancelJustPressed()) { GS.screen = 'world'; inputCooldown = 200; }
}
function drawStarterSelect(time) {
    drawWorld(time);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffdd88'; ctx.font = '28px Fredoka One, cursive';
    ctx.fillText('Choose Your Digital Partner!', canvas.width/2, 60);
    const s = GS.starterSelect; const spacing = Math.min(200, canvas.width/4); const startX = canvas.width/2-spacing;
    s.starters.forEach((sid, i) => {
        const sp = SPECIES[sid]; const cx = startX+i*spacing; const cy = canvas.height*0.4; const sel = i===s.cursor;
        if (sel) { ctx.fillStyle = sp.color+'33'; ctx.beginPath(); ctx.arc(cx, cy, 70, 0, Math.PI*2); ctx.fill(); ctx.strokeStyle = sp.color; ctx.lineWidth = 3; ctx.stroke(); }
        drawCreature(cx, cy, sp, sel?40:30, time);
        ctx.fillStyle = sel?'#fff':'#888'; ctx.font = `${sel?22:18}px Fredoka One, cursive`; ctx.fillText(sp.name, cx, cy+70);
        ctx.fillStyle = TYPE_COLORS[sp.type]; ctx.font = '14px Fredoka One, cursive';
        ctx.fillText(`${TYPE_EMOJI[sp.type]} ${sp.type.toUpperCase()}`, cx, cy+92);
        if (sel) { ctx.fillStyle = '#ccc'; ctx.font = '13px Nunito, cursive'; ctx.fillText(`HP:${sp.baseHp} ATK:${sp.baseAtk} DEF:${sp.baseDef} SPD:${sp.baseSpd}`, cx, cy+112);
            ctx.fillStyle = '#aaa'; ctx.font = '12px Nunito, cursive'; wrapText(sp.desc, 250).forEach((l,li) => ctx.fillText(l, cx, cy+130+li*16)); }
    });
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '14px Nunito, cursive';
    ctx.fillText('← → to choose | Z/Space to confirm', canvas.width/2, canvas.height-30);
}

// ── Battle System ───────────────────────────────────────────
function startBattle(opponent, isWild, trainerNpc, badge) {
    sfx('encounter');
    const enemyTeam = Array.isArray(opponent) ? opponent : [opponent];
    GS.battle = {
        phase: 'intro', playerTop: GS.team.find(t => t.hp > 0) || GS.team[0],
        enemyTeam, enemyIndex: 0, enemyTop: enemyTeam[0], isWild, trainerNpc, badge,
        message: isWild ? `A wild ${enemyTeam[0].name} appeared!` : `${trainerNpc.name} wants to battle!`,
        cursor: 0, subMenu: null, subCursor: 0, animTimer: 0,
        shakeEnemy: 0, shakePlayer: 0, playerDefending: false, enemyDefending: false,
        catchAnim: 0, catchSuccess: false, xpMessages: [], xpMsgIndex: 0, introTimer: 0,
        playerStatBoosts: {atk:0,def:0,spd:0}, enemyStatBoosts: {atk:0,def:0,spd:0},
        pendingEnemyTurn: false, resultType: null, bagItems: []
    };
    GS.screen = 'battle'; inputCooldown = 500;
}

function updateBattle(dt) {
    if (inputCooldown > 0) { inputCooldown -= dt; return; }
    const b = GS.battle; if (!b) return;
    switch (b.phase) {
        case 'intro': b.introTimer += dt; if (b.introTimer > 1500 || actionJustPressed()) { b.phase = 'choose'; b.message = 'What will you do?'; inputCooldown = 200; } break;
        case 'choose':
            if (!b.subMenu) {
                if (isDown('up')||isDown('left')) { b.cursor = (b.cursor+3)%4; sfx('select'); inputCooldown = 150; }
                if (isDown('down')||isDown('right')) { b.cursor = (b.cursor+1)%4; sfx('select'); inputCooldown = 150; }
                if (actionJustPressed()) {
                    sfx('confirm');
                    if (b.cursor===0) { b.subMenu='fight'; b.subCursor=0; }
                    else if (b.cursor===1) { b.subMenu='bag'; b.subCursor=0; b.bagItems=Object.entries(GS.bag).filter(([k,v])=>v>0); }
                    else if (b.cursor===2) { b.subMenu='team'; b.subCursor=0; }
                    else if (b.cursor===3) {
                        if (b.isWild) { if (Math.random()<0.5+(b.playerTop.spd-b.enemyTop.spd)*0.02) { b.message='Got away safely!'; b.phase='result'; b.resultType='run'; } else { b.message="Can't escape!"; b.phase='animate'; b.animTimer=0; b.pendingEnemyTurn=true; } }
                        else { b.message="Can't run from a tamer battle!"; inputCooldown=500; }
                    }
                    inputCooldown = 200;
                }
            } else if (b.subMenu==='fight') {
                const moves = b.playerTop.moves;
                if (isDown('up')) { b.subCursor=Math.max(0,b.subCursor-1); sfx('select'); inputCooldown=150; }
                if (isDown('down')) { b.subCursor=Math.min(moves.length-1,b.subCursor+1); sfx('select'); inputCooldown=150; }
                if (cancelJustPressed()) { b.subMenu=null; sfx('cancel'); inputCooldown=150; return; }
                if (actionJustPressed()) { const mk = moves[b.subCursor]; if (b.playerTop.movePP[mk]>0) executeTurn(mk); else { b.message='No PP left!'; inputCooldown=200; } }
            } else if (b.subMenu==='bag') {
                const items = b.bagItems;
                if (items.length===0) { b.message='Bag is empty!'; b.subMenu=null; inputCooldown=200; return; }
                if (isDown('up')) { b.subCursor=Math.max(0,b.subCursor-1); sfx('select'); inputCooldown=150; }
                if (isDown('down')) { b.subCursor=Math.min(items.length-1,b.subCursor+1); sfx('select'); inputCooldown=150; }
                if (cancelJustPressed()) { b.subMenu=null; sfx('cancel'); inputCooldown=150; return; }
                if (actionJustPressed()) {
                    const [ik,qty] = items[b.subCursor]; const item = ITEMS[ik];
                    if (item.effect==='catch') { if (!b.isWild) { b.message="Can't catch a tamer's creature!"; inputCooldown=300; return; } GS.bag[ik]--; attemptCatch(item.value); }
                    else if (item.effect==='heal') { GS.bag[ik]--; b.playerTop.hp=Math.min(b.playerTop.maxHp,b.playerTop.hp+item.value); sfx('heal'); b.message=`Used ${item.name}!`; b.subMenu=null; b.phase='animate'; b.animTimer=0; b.pendingEnemyTurn=true; }
                    else if (item.effect==='revive') { const f = GS.team.find(t=>t.hp<=0); if (f) { GS.bag[ik]--; f.hp=Math.floor(f.maxHp*item.value); sfx('heal'); b.message=`${f.name} revived!`; } else b.message='No fainted creatures!'; b.subMenu=null; inputCooldown=300; }
                    inputCooldown=200;
                }
            } else if (b.subMenu==='team') {
                if (isDown('up')) { b.subCursor=Math.max(0,b.subCursor-1); sfx('select'); inputCooldown=150; }
                if (isDown('down')) { b.subCursor=Math.min(GS.team.length-1,b.subCursor+1); sfx('select'); inputCooldown=150; }
                if (cancelJustPressed()) { b.subMenu=null; sfx('cancel'); inputCooldown=150; return; }
                if (actionJustPressed()) {
                    const ch = GS.team[b.subCursor];
                    if (ch.hp<=0) b.message=`${ch.name} has fainted!`;
                    else if (ch===b.playerTop) b.message=`${ch.name} is already out!`;
                    else { b.playerTop=ch; b.message=`Go, ${ch.name}!`; b.subMenu=null; b.playerStatBoosts={atk:0,def:0,spd:0}; b.phase='animate'; b.animTimer=0; b.pendingEnemyTurn=true; }
                    inputCooldown=200;
                }
            }
            break;
        case 'animate':
            b.animTimer += dt;
            if (b.animTimer > 1200) {
                if (b.pendingEnemyTurn) { b.pendingEnemyTurn=false; enemyTurn(); }
                else if (b.playerTop.hp<=0) { const alive = GS.team.find(t=>t.hp>0); if (alive) { b.message=`${b.playerTop.name} fainted! Choose another!`; b.subMenu='team'; b.subCursor=0; b.phase='choose'; } else { b.message='All creatures fainted...'; b.phase='result'; b.resultType='lose'; sfx('lose'); } }
                else if (b.enemyTop.hp<=0) {
                    b.enemyIndex++; if (b.enemyIndex<b.enemyTeam.length) { b.enemyTop=b.enemyTeam[b.enemyIndex]; b.enemyStatBoosts={atk:0,def:0,spd:0}; b.message=b.isWild?`Wild ${b.enemyTop.name}!`:`Sent out ${b.enemyTop.name}!`; b.phase='animate'; b.animTimer=0; }
                    else {
                        const xpG = Math.floor(20+b.enemyTop.level*8); b.xpMessages=addXP(b.playerTop,xpG);
                        b.xpMessages.unshift(`${b.playerTop.name} gained ${xpG} XP!`);
                        if (b.xpMessages.some(m=>m.includes('digivolving'))) { GS.evolved=true; sfx('digivolve'); } else sfx('win');
                        if (b.xpMessages.some(m=>m.includes('grew to'))) sfx('levelup');
                        b.phase='xp_gain'; b.xpMsgIndex=0; b.resultType='win'; GS.battleCount++;
                        const gold = b.isWild?50+b.enemyTop.level*5:150+b.enemyTop.level*15; GS.gold+=gold;
                        b.xpMessages.push(`Got ${gold} gold!`);
                        if (b.badge) { if (!GS.badges.includes(b.badge)) GS.badges.push(b.badge); b.xpMessages.push(`Received: ${b.badge}! 🏅`); }
                        if (b.trainerNpc) { b.trainerNpc.defeated=true; GS.trainersDefeated[b.trainerNpc.name]=true; }
                    }
                } else { b.phase='choose'; b.message='What will you do?'; b.subMenu=null; b.playerDefending=false; }
                inputCooldown=200;
            }
            break;
        case 'xp_gain':
            if (actionJustPressed()) { b.xpMsgIndex++; sfx('select'); if (b.xpMsgIndex>=b.xpMessages.length) { b.phase='result'; b.message=b.isWild?'Victory!':b.trainerNpc?.defeatMsg||'You win!'; } inputCooldown=200; }
            break;
        case 'catch_anim':
            b.catchAnim += dt; if (b.catchAnim>2500) { if (b.catchSuccess) { if (GS.team.length<MAX_TEAM_SIZE) GS.team.push(b.enemyTop); else GS.box.push(b.enemyTop); b.enemyTop.caught=true; b.message=`Caught ${b.enemyTop.name}! 🎉`; b.phase='result'; b.resultType='catch'; sfx('catch'); } else { b.message=`${b.enemyTop.name} broke free!`; b.phase='animate'; b.animTimer=0; b.pendingEnemyTurn=true; } inputCooldown=300; }
            break;
        case 'result':
            if (actionJustPressed()) {
                sfx('confirm');
                if (b.resultType==='lose') { GS.team.forEach(t => { t.hp=Math.floor(t.maxHp*0.5); t.moves.forEach(m=>t.movePP[m]=MOVES_DB[m].pp); }); GS.gold=Math.max(0,GS.gold-100); addNotification('Blacked out! Lost some gold...'); if ([2,3,4,5,6,7].includes(GS.zone)) { GS.player.x=6*TILE; GS.player.y=21*TILE; GS.zone=2; } else { GS.player.x=21*TILE; GS.player.y=18*TILE; GS.zone=0; } }
                GS.screen='world'; GS.battle=null; saveGame(); inputCooldown=300;
            }
            break;
    }
}

function executeTurn(mk) {
    const b = GS.battle; const move = MOVES_DB[mk]; b.playerTop.movePP[mk]--; b.subMenu=null;
    const pSpd = b.playerTop.spd*(1+b.playerStatBoosts.spd*0.25); const eSpd = b.enemyTop.spd*(1+b.enemyStatBoosts.spd*0.25);
    if (pSpd>=eSpd) { executeMove(move,b.playerTop,b.enemyTop,b.playerStatBoosts,b.enemyStatBoosts,true); if (b.enemyTop.hp>0) b.pendingEnemyTurn=true; }
    else { enemyTurn(); if (b.playerTop.hp>0) setTimeout(()=>executeMove(move,b.playerTop,b.enemyTop,b.playerStatBoosts,b.enemyStatBoosts,true),600); }
    b.phase='animate'; b.animTimer=0; inputCooldown=300;
}
function executeMove(move, atk, def, atkB, defB, isP) {
    const b = GS.battle;
    if (move.effect==='heal_30') { atk.hp=Math.min(atk.maxHp,atk.hp+Math.floor(atk.maxHp*0.3)); b.message=`${atk.name} restored HP!`; sfx('heal'); return; }
    if (move.effect==='heal_60') { atk.hp=Math.min(atk.maxHp,atk.hp+Math.floor(atk.maxHp*0.6)); b.message=`${atk.name} restored lots of HP!`; sfx('heal'); return; }
    if (move.effect==='def_up') { atkB.def=Math.min(3,atkB.def+1); b.message=`${atk.name}'s defense rose!`; sfx('confirm'); if (isP) b.playerDefending=true; else b.enemyDefending=true; return; }
    if (move.effect==='atk_up') { atkB.atk=Math.min(3,atkB.atk+1); b.message=`${atk.name}'s attack rose!`; sfx('confirm'); return; }
    if (move.effect==='spd_up') { atkB.spd=Math.min(3,atkB.spd+1); b.message=`${atk.name}'s speed rose!`; sfx('confirm'); return; }
    if (Math.random()*100>move.acc) { b.message=`${atk.name} used ${move.name}... but missed!`; sfx('cancel'); return; }
    const atkS = atk.atk*(1+atkB.atk*0.25); const defS = def.def*(1+defB.def*0.25);
    const stab = move.type===atk.type?1.3:1.0; const tE = typeMultiplier(move.type, def.type);
    const crit = Math.random()<0.08?1.5:1.0; const rand = 0.85+Math.random()*0.15;
    const dMult = (isP?b.enemyDefending:b.playerDefending)?0.5:1.0;
    let dmg = Math.max(1, Math.floor(((2*atk.level/5+2)*move.power*atkS/defS/50+2)*stab*tE*crit*rand*dMult));
    def.hp = Math.max(0, def.hp-dmg);
    let msg = `${atk.name} used ${move.name}!`;
    if (tE>1) msg+=' Super effective!'; if (tE<1) msg+=' Not very effective...';
    if (crit>1) { msg+=' Critical!'; sfx('crit'); } else sfx('hit');
    b.message=msg;
    if (isP) { b.shakeEnemy=10; screenShake(5); } else { b.shakePlayer=10; screenShake(5); }
    for (let i=0;i<8;i++) addParticle(isP?canvas.width*0.7:canvas.width*0.3, canvas.height*0.35, TYPE_COLORS[move.type], 30);
}
function enemyTurn() {
    const b = GS.battle; b.enemyDefending=false;
    const moves = b.enemyTop.moves.filter(m=>b.enemyTop.movePP[m]>0);
    if (moves.length===0) { b.message=`${b.enemyTop.name} has no moves!`; return; }
    let best=moves[0], bestS=-1;
    moves.forEach(mk => { const m=MOVES_DB[mk]; let s=m.power*typeMultiplier(m.type,b.playerTop.type); if (m.effect&&m.power===0) { if (m.effect.startsWith('heal')&&b.enemyTop.hp<b.enemyTop.maxHp*0.4) s=80; else if (m.effect==='atk_up'&&b.enemyStatBoosts.atk<2) s=40; else s=10; } if (s>bestS) { bestS=s; best=mk; } });
    if (Math.random()<0.2) best=moves[Math.floor(Math.random()*moves.length)];
    b.enemyTop.movePP[best]--; executeMove(MOVES_DB[best],b.enemyTop,b.playerTop,b.enemyStatBoosts,b.playerStatBoosts,false);
}
function attemptCatch(mult) {
    const b=GS.battle; const t=b.enemyTop; const hpP=t.hp/t.maxHp;
    const rate=(1-hpP*0.7)*mult*(t.species.rarity==='common'?1.2:t.species.rarity==='uncommon'?1.0:t.species.rarity==='rare'?0.6:t.species.rarity==='epic'?0.3:0.15);
    b.catchSuccess=Math.random()<rate; b.catchAnim=0; b.phase='catch_anim'; b.subMenu=null; b.message='Throwing Digi-Egg...'; sfx('select'); inputCooldown=300;
}

function drawBattle(time) {
    const b=GS.battle; if (!b) return;
    const bg=ctx.createLinearGradient(0,0,0,canvas.height); bg.addColorStop(0,'#1a0a4a'); bg.addColorStop(0.5,'#2a1a5a'); bg.addColorStop(1,'#0a0a3a');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='rgba(255,255,255,0.03)'; ctx.beginPath(); ctx.ellipse(canvas.width/2,canvas.height*0.55,canvas.width*0.45,canvas.height*0.2,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=2; ctx.stroke();
    // Particles
    for (let i=GS.particles.length-1;i>=0;i--) { const p=GS.particles[i]; p.x+=p.vx; p.y+=p.vy; p.life--; const a=p.life/p.maxLife; ctx.fillStyle=p.color+Math.floor(a*255).toString(16).padStart(2,'0'); ctx.beginPath(); ctx.arc(p.x,p.y,p.size*a,0,Math.PI*2); ctx.fill(); if (p.life<=0) GS.particles.splice(i,1); }
    // Enemy
    const eX=canvas.width*0.7+(b.shakeEnemy>0?(Math.random()-0.5)*b.shakeEnemy:0);
    if (b.shakeEnemy>0) b.shakeEnemy-=0.5;
    if (b.phase!=='catch_anim'||b.catchAnim<500) drawCreature(eX,canvas.height*0.3,b.enemyTop.species,45,time,b.enemyTop.hp,b.enemyTop.maxHp);
    else { const bp=Math.min(1,(b.catchAnim-500)/1000); ctx.font='30px sans-serif'; ctx.textAlign='center'; ctx.fillText('🥚',eX+Math.sin(b.catchAnim/200)*10*(1-bp),canvas.height*0.3+bp*30); }
    // Player
    const pX=canvas.width*0.3+(b.shakePlayer>0?(Math.random()-0.5)*b.shakePlayer:0);
    if (b.shakePlayer>0) b.shakePlayer-=0.5;
    drawCreature(pX,canvas.height*0.55,b.playerTop.species,50,time,b.playerTop.hp,b.playerTop.maxHp);
    // Enemy info
    drawRoundRect(canvas.width*0.05,20,260,70,10,'rgba(0,0,0,0.7)','#666');
    ctx.fillStyle='#fff'; ctx.font='16px Fredoka One, cursive'; ctx.textAlign='left';
    ctx.fillText(`${TYPE_EMOJI[b.enemyTop.type]} ${b.enemyTop.name} Lv${b.enemyTop.level}`,canvas.width*0.05+12,44);
    ctx.fillStyle=STAGE_COLORS[b.enemyTop.species.stage]; ctx.font='11px Nunito, cursive';
    ctx.fillText(`${STAGES[b.enemyTop.species.stage]} • ${b.enemyTop.type.toUpperCase()}`,canvas.width*0.05+12,58);
    const eHP=b.enemyTop.hp/b.enemyTop.maxHp; drawBar(canvas.width*0.05+12,64,200,10,eHP,eHP>0.5?'#4d4':eHP>0.2?'#dd4':'#d44');
    ctx.fillStyle='#aaa'; ctx.font='10px Nunito'; ctx.fillText(`${b.enemyTop.hp}/${b.enemyTop.maxHp}`,canvas.width*0.05+218,74);
    // Player info
    const piX=canvas.width*0.55;
    drawRoundRect(piX,canvas.height*0.62,280,80,10,'rgba(0,0,0,0.7)','#666');
    ctx.fillStyle='#fff'; ctx.font='16px Fredoka One, cursive'; ctx.textAlign='left';
    ctx.fillText(`${TYPE_EMOJI[b.playerTop.type]} ${b.playerTop.name} Lv${b.playerTop.level}`,piX+12,canvas.height*0.62+24);
    ctx.fillStyle=STAGE_COLORS[b.playerTop.species.stage]; ctx.font='11px Nunito';
    ctx.fillText(`${STAGES[b.playerTop.species.stage]} • ${b.playerTop.type.toUpperCase()}`,piX+12,canvas.height*0.62+38);
    const pHP=b.playerTop.hp/b.playerTop.maxHp; drawBar(piX+12,canvas.height*0.62+44,220,12,pHP,pHP>0.5?'#4d4':pHP>0.2?'#dd4':'#d44');
    ctx.fillStyle='#ccc'; ctx.font='11px Nunito'; ctx.fillText(`HP:${b.playerTop.hp}/${b.playerTop.maxHp}`,piX+12,canvas.height*0.62+65);
    const xpP=b.playerTop.xp/xpToNext(b.playerTop.level); drawBar(piX+120,canvas.height*0.62+56,120,8,xpP,'#66aaff');
    // Message
    const msgY=canvas.height-160;
    drawRoundRect(20,msgY,canvas.width-40,50,10,'rgba(0,0,0,0.8)','#8866cc');
    ctx.fillStyle='#fff'; ctx.font='15px Fredoka One, cursive'; ctx.textAlign='left'; ctx.fillText(b.message,36,msgY+30);
    if (b.phase==='xp_gain'&&b.xpMessages.length>0) { drawRoundRect(20,msgY-50,canvas.width-40,44,10,'rgba(40,20,80,0.9)','#ffaa44'); ctx.fillStyle='#ffdd88'; ctx.fillText(b.xpMessages[b.xpMsgIndex]||'',36,msgY-24); }
    // Battle menu
    if (b.phase==='choose') {
        const menuY=canvas.height-100; const mW=Math.min(400,canvas.width-40);
        if (!b.subMenu) {
            const opts=['⚔️ Fight','🎒 Bag','🔄 Team','🏃 Run'];
            drawRoundRect((canvas.width-mW)/2,menuY,mW,90,10,'rgba(20,15,40,0.95)','#8866cc');
            opts.forEach((o,i) => { const ox=(canvas.width-mW)/2+20+(i%2)*(mW/2-10); const oy=menuY+20+Math.floor(i/2)*36;
                if (i===b.cursor) { drawRoundRect(ox-4,oy-12,mW/2-20,30,6,'rgba(100,80,180,0.5)'); ctx.fillStyle='#ffdd88'; } else ctx.fillStyle='#aaaacc';
                ctx.font='15px Fredoka One, cursive'; ctx.textAlign='left'; ctx.fillText(o,ox+4,oy+6); });
        } else if (b.subMenu==='fight') {
            const moves=b.playerTop.moves;
            drawRoundRect((canvas.width-mW)/2,menuY-20,mW,30+moves.length*32,10,'rgba(20,15,40,0.95)','#8866cc');
            moves.forEach((mk,i) => { const m=MOVES_DB[mk]; const my=menuY+i*32;
                if (i===b.subCursor) { drawRoundRect((canvas.width-mW)/2+8,my-8,mW-16,28,6,'rgba(100,80,180,0.5)'); ctx.fillStyle='#ffdd88'; } else ctx.fillStyle='#aaaacc';
                ctx.font='14px Fredoka One, cursive'; ctx.textAlign='left';
                ctx.fillText(`${TYPE_EMOJI[m.type]} ${m.name}`,(canvas.width-mW)/2+20,my+10);
                ctx.fillStyle=TYPE_COLORS[m.type]; ctx.font='11px Nunito';
                ctx.fillText(`PWR:${m.power||'--'} PP:${b.playerTop.movePP[mk]}/${m.pp}`,(canvas.width-mW)/2+mW-150,my+10); });
        } else if (b.subMenu==='bag') {
            const items=b.bagItems; const bw=Math.min(350,canvas.width-40);
            drawRoundRect((canvas.width-bw)/2,menuY-20,bw,30+Math.max(1,items.length)*30,10,'rgba(20,15,40,0.95)','#8866cc');
            if (items.length===0) { ctx.fillStyle='#aaa'; ctx.font='14px Fredoka One'; ctx.textAlign='center'; ctx.fillText('Empty!',canvas.width/2,menuY+10); }
            items.forEach(([k,q],i) => { const it=ITEMS[k]; const iy=menuY+i*30;
                if (i===b.subCursor) { drawRoundRect((canvas.width-bw)/2+8,iy-8,bw-16,26,6,'rgba(100,80,180,0.5)'); ctx.fillStyle='#ffdd88'; } else ctx.fillStyle='#aaaacc';
                ctx.font='14px Fredoka One'; ctx.textAlign='left'; ctx.fillText(`${it.emoji} ${it.name} x${q}`,(canvas.width-bw)/2+20,iy+10); });
        } else if (b.subMenu==='team') {
            const tw=Math.min(400,canvas.width-40);
            drawRoundRect((canvas.width-tw)/2,menuY-40,tw,30+GS.team.length*34,10,'rgba(20,15,40,0.95)','#8866cc');
            GS.team.forEach((t,i) => { const ty=menuY-20+i*34;
                if (i===b.subCursor) { drawRoundRect((canvas.width-tw)/2+8,ty-10,tw-16,30,6,'rgba(100,80,180,0.5)'); ctx.fillStyle=t.hp>0?'#ffdd88':'#884444'; } else ctx.fillStyle=t.hp>0?'#aaaacc':'#666';
                ctx.font='14px Fredoka One'; ctx.textAlign='left'; ctx.fillText(`${TYPE_EMOJI[t.type]} ${t.name} Lv${t.level}`,(canvas.width-tw)/2+20,ty+8);
                const hp=t.hp/t.maxHp; drawBar((canvas.width-tw)/2+tw-120,ty-2,80,8,hp,hp>0.5?'#4d4':hp>0.2?'#dd4':'#d44'); });
        }
    }
    if (b.phase==='result') {
        ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.textAlign='center'; ctx.font='32px Fredoka One, cursive';
        if (b.resultType==='win'||b.resultType==='catch') { ctx.fillStyle='#ffdd44'; ctx.fillText(b.resultType==='catch'?'🎉 Caught! 🎉':'🏆 Victory! 🏆',canvas.width/2,canvas.height*0.35); }
        else if (b.resultType==='lose') { ctx.fillStyle='#ff6644'; ctx.fillText('💫 Defeated... 💫',canvas.width/2,canvas.height*0.35); }
        else { ctx.fillStyle='#aaddff'; ctx.fillText('🏃 Escaped!',canvas.width/2,canvas.height*0.35); }
        ctx.fillStyle='#ccc'; ctx.font='16px Fredoka One'; ctx.fillText(b.message,canvas.width/2,canvas.height*0.45);
        ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font='14px Nunito'; ctx.fillText('Press Space',canvas.width/2,canvas.height*0.55);
    }
    if (b.isWild&&b.phase==='choose') { ctx.fillStyle='rgba(255,255,100,0.7)'; ctx.font='12px Nunito'; ctx.textAlign='left'; ctx.fillText('🌿 WILD',canvas.width*0.05+12,16); }
}

// ── Menu ────────────────────────────────────────────────────
const MENU_ITEMS = ['Team','Bag','Quests','Save','Close'];
function updateMenu(dt) {
    if (inputCooldown>0) { inputCooldown-=dt; return; }
    if (cancelJustPressed()) { GS.screen='world'; sfx('cancel'); inputCooldown=200; return; }
    if (isDown('up')) { GS.menu.cursor=Math.max(0,GS.menu.cursor-1); sfx('select'); inputCooldown=150; }
    if (isDown('down')) { GS.menu.cursor=Math.min(MENU_ITEMS.length-1,GS.menu.cursor+1); sfx('select'); inputCooldown=150; }
    if (actionJustPressed()) {
        sfx('confirm');
        switch (MENU_ITEMS[GS.menu.cursor]) {
            case 'Team': GS.screen='team_view'; GS.teamView={cursor:0}; break;
            case 'Bag': GS.screen='bag'; GS.bagView={cursor:0,items:Object.entries(GS.bag).filter(([k,v])=>v>0)}; break;
            case 'Quests': GS.screen='quests'; break;
            case 'Save': saveGame(); addNotification('💾 Saved!'+(currentUser?' ☁️':'')); sfx('confirm'); GS.screen='world'; break;
            case 'Close': GS.screen='world'; break;
        }
        inputCooldown=200;
    }
}
function drawMenu(time) {
    drawWorld(time); ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    const mw=200,mh=MENU_ITEMS.length*38+20,mx=canvas.width-mw-20,my=20;
    drawRoundRect(mx,my,mw,mh,12,'rgba(20,15,40,0.95)','#8866cc');
    MENU_ITEMS.forEach((it,i) => { const iy=my+16+i*38;
        if (i===GS.menu.cursor) { drawRoundRect(mx+8,iy-8,mw-16,32,6,'rgba(100,80,180,0.5)'); ctx.fillStyle='#ffdd88'; } else ctx.fillStyle='#ccccdd';
        ctx.font='16px Fredoka One, cursive'; ctx.textAlign='left'; ctx.fillText(`${i===GS.menu.cursor?'▶ ':'  '}${it}`,mx+16,iy+12); });
    drawRoundRect(20,20,220,140,12,'rgba(20,15,40,0.95)','#666');
    ctx.fillStyle='#fff'; ctx.font='16px Fredoka One'; ctx.textAlign='left'; ctx.fillText('🎮 Digital Tamer',36,44);
    ctx.fillStyle='#ffdd44'; ctx.font='13px Nunito';
    ctx.fillText(`💰 Gold: ${GS.gold}`,36,65); ctx.fillText(`🏅 Crests: ${GS.badges.length}`,36,82);
    ctx.fillText(`⚔️ Battles: ${GS.battleCount}`,36,99); ctx.fillText(`📍 ${ZONES[GS.zone].name}`,36,116);
    ctx.fillText(currentUser?`☁️ Cloud save`:`💾 Local save`,36,133);
    const h=Math.floor(GS.playTime/3600000),m=Math.floor((GS.playTime%3600000)/60000); ctx.fillText(`⏱️ ${h}h ${m}m`,36,150);
}

// ── Team/Bag/Quest views ────────────────────────────────────
function updateTeamView(dt) { if (inputCooldown>0) { inputCooldown-=dt; return; } if (cancelJustPressed()) { GS.screen='menu'; sfx('cancel'); inputCooldown=200; return; } if (isDown('up')) { GS.teamView.cursor=Math.max(0,GS.teamView.cursor-1); sfx('select'); inputCooldown=150; } if (isDown('down')) { GS.teamView.cursor=Math.min(GS.team.length-1,GS.teamView.cursor+1); sfx('select'); inputCooldown=150; } }
function drawTeamView(time) {
    ctx.fillStyle='#0a0a2e'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.textAlign='center'; ctx.fillStyle='#ffdd88'; ctx.font='24px Fredoka One'; ctx.fillText('My Digital Creatures',canvas.width/2,36);
    GS.team.forEach((t,i) => { const ty=56+i*80; const sel=i===GS.teamView.cursor;
        drawRoundRect(20,ty,canvas.width-40,72,10,sel?'rgba(60,40,100,0.8)':'rgba(30,25,50,0.8)',sel?'#aa88dd':'#444');
        drawCreature(70,ty+36,t.species,22,time,t.hp,t.maxHp);
        ctx.textAlign='left'; ctx.fillStyle='#fff'; ctx.font='16px Fredoka One'; ctx.fillText(t.name,110,ty+22);
        ctx.fillStyle=STAGE_COLORS[t.species.stage]; ctx.font='12px Nunito'; ctx.fillText(`${STAGES[t.species.stage]} • ${TYPE_EMOJI[t.type]} ${t.type.toUpperCase()} Lv${t.level}`,110,ty+38);
        const hp=t.hp/t.maxHp; drawBar(110,ty+46,120,8,hp,hp>0.5?'#4d4':hp>0.2?'#dd4':'#d44');
        ctx.fillStyle='#aaa'; ctx.font='10px Nunito'; ctx.fillText(`${t.hp}/${t.maxHp}`,236,ty+55);
        if (sel) { ctx.fillStyle='#ccc'; ctx.font='12px Nunito'; const sx=canvas.width-220; ctx.fillText(`ATK:${t.atk}`,sx,ty+20); ctx.fillText(`DEF:${t.def}`,sx,ty+34); ctx.fillText(`SPD:${t.spd}`,sx,ty+48); ctx.fillText(`XP:${t.xp}/${xpToNext(t.level)}`,sx,ty+62); }
    });
    ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='12px Nunito'; ctx.textAlign='center'; ctx.fillText('X = Back',canvas.width/2,canvas.height-16);
}
function updateBag(dt) { if (inputCooldown>0) { inputCooldown-=dt; return; } const bv=GS.bagView; bv.items=Object.entries(GS.bag).filter(([k,v])=>v>0);
    if (cancelJustPressed()) { GS.screen='menu'; sfx('cancel'); inputCooldown=200; return; } if (bv.items.length===0) return;
    if (isDown('up')) { bv.cursor=Math.max(0,bv.cursor-1); sfx('select'); inputCooldown=150; }
    if (isDown('down')) { bv.cursor=Math.min(bv.items.length-1,bv.cursor+1); sfx('select'); inputCooldown=150; }
    if (actionJustPressed()) { const [k]=bv.items[bv.cursor]; const it=ITEMS[k]; if (it&&(it.effect==='heal'||it.effect==='revive'||it.effect.startsWith('stat_'))) { GS.screen='team_view'; GS.teamView={cursor:0,useItem:k}; sfx('confirm'); } inputCooldown=200; }
}
function drawBag(time) {
    ctx.fillStyle='#0a0a2e'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.textAlign='center'; ctx.fillStyle='#ffdd88'; ctx.font='24px Fredoka One'; ctx.fillText('🎒 Bag',canvas.width/2,36);
    ctx.fillStyle='#ffdd44'; ctx.font='14px Nunito'; ctx.fillText(`💰 ${GS.gold} Gold`,canvas.width/2,56);
    const bv=GS.bagView; if (bv.items.length===0) { ctx.fillStyle='#888'; ctx.font='16px Fredoka One'; ctx.fillText('Empty!',canvas.width/2,canvas.height/2); return; }
    bv.items.forEach(([k,q],i) => { const it=ITEMS[k]; if (!it) return; const iy=70+i*50; const sel=i===bv.cursor;
        drawRoundRect(30,iy,canvas.width-60,44,8,sel?'rgba(60,40,100,0.8)':'rgba(30,25,50,0.8)',sel?'#aa88dd':'#444');
        ctx.textAlign='left'; ctx.fillStyle=sel?'#ffdd88':'#ccc'; ctx.font='15px Fredoka One'; ctx.fillText(`${it.emoji} ${it.name} x${q}`,50,iy+20);
        ctx.fillStyle='#999'; ctx.font='11px Nunito'; ctx.fillText(it.desc,50,iy+36); });
    ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='12px Nunito'; ctx.textAlign='center'; ctx.fillText('Z = Use | X = Back',canvas.width/2,canvas.height-16);
}
function updateQuests(dt) { if (inputCooldown>0) { inputCooldown-=dt; return; } if (cancelJustPressed()) { GS.screen='menu'; sfx('cancel'); inputCooldown=200; } }
function drawQuests(time) {
    ctx.fillStyle='#0a0a2e'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.textAlign='center'; ctx.fillStyle='#ffdd88'; ctx.font='24px Fredoka One'; ctx.fillText('📜 Quests',canvas.width/2,36);
    QUESTS.forEach((q,i) => { const qy=56+i*48; const done=GS.questsDone.includes(q.id); const active=!done&&q.check(GS);
        drawRoundRect(30,qy,canvas.width-60,42,8,done?'rgba(40,80,40,0.6)':active?'rgba(80,60,40,0.6)':'rgba(30,25,50,0.6)',done?'#4a4':active?'#da4':'#444');
        ctx.textAlign='left'; ctx.fillStyle=done?'#8d8':active?'#fda':'#aaa'; ctx.font='14px Fredoka One';
        ctx.fillText(`${done?'✅':active?'⭐':'⬜'} ${q.name}`,46,qy+18);
        ctx.fillStyle=done?'#6a6':'#999'; ctx.font='11px Nunito'; ctx.fillText(q.desc,46,qy+34);
        if (active) { ctx.fillStyle='#ffaa44'; ctx.textAlign='right'; ctx.font='11px Fredoka One'; ctx.fillText('READY!',canvas.width-46,qy+18); } });
    ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='12px Nunito'; ctx.textAlign='center'; ctx.fillText('X = Back',canvas.width/2,canvas.height-16);
}
function checkQuests() { QUESTS.forEach(q => { if (!GS.questsDone.includes(q.id)&&q.check(GS)) { GS.questsDone.push(q.id); GS.gold+=(q.reward.gold||0); if (q.reward.item) GS.bag[q.reward.item.id]=(GS.bag[q.reward.item.id]||0)+q.reward.item.qty; addNotification(`✅ Quest: ${q.name}!`); sfx('catch'); } }); }

// ── Shop ────────────────────────────────────────────────────
function updateShop(dt) {
    if (inputCooldown>0) { inputCooldown-=dt; return; } const s=GS.shop; if (!s) { GS.screen='world'; return; }
    if (cancelJustPressed()) { GS.screen='world'; GS.shop=null; sfx('cancel'); inputCooldown=200; return; }
    if (isDown('up')) { s.cursor=Math.max(0,s.cursor-1); sfx('select'); inputCooldown=150; }
    if (isDown('down')) { s.cursor=Math.min(s.items.length-1,s.cursor+1); sfx('select'); inputCooldown=150; }
    if (actionJustPressed()) { const ik=s.items[s.cursor]; const it=ITEMS[ik];
        if (GS.gold>=it.price) { GS.gold-=it.price; GS.bag[ik]=(GS.bag[ik]||0)+1; sfx('buy'); addNotification(`Bought ${it.name}!`); saveGame(); }
        else { sfx('bump'); addNotification('Not enough gold!'); } inputCooldown=200; }
}
function drawShop(time) {
    drawWorld(time); ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    const s=GS.shop; const sw=Math.min(400,canvas.width-40); const sh=s.items.length*52+60;
    const sx=(canvas.width-sw)/2,sy=(canvas.height-sh)/2;
    drawRoundRect(sx,sy,sw,sh,12,'rgba(20,15,40,0.95)','#ffaa44');
    ctx.textAlign='center'; ctx.fillStyle='#ffdd88'; ctx.font='20px Fredoka One'; ctx.fillText('🏪 Digi-Shop',canvas.width/2,sy+28);
    ctx.fillStyle='#ffdd44'; ctx.font='13px Nunito'; ctx.fillText(`💰 ${GS.gold}`,canvas.width/2,sy+48);
    s.items.forEach((k,i) => { const it=ITEMS[k]; const iy=sy+58+i*52; const sel=i===s.cursor; const afford=GS.gold>=it.price;
        drawRoundRect(sx+10,iy,sw-20,46,8,sel?'rgba(100,80,180,0.5)':'rgba(40,30,60,0.5)',sel?'#aa88dd':'#555');
        ctx.textAlign='left'; ctx.fillStyle=sel?(afford?'#ffdd88':'#ff8888'):'#aaa'; ctx.font='15px Fredoka One'; ctx.fillText(`${it.emoji} ${it.name}`,sx+24,iy+20);
        ctx.fillStyle='#999'; ctx.font='11px Nunito'; ctx.fillText(it.desc,sx+24,iy+36);
        ctx.textAlign='right'; ctx.fillStyle=afford?'#ffdd44':'#ff6644'; ctx.font='14px Fredoka One'; ctx.fillText(`💰${it.price}`,sx+sw-24,iy+20); });
    GS.notifications.forEach((n,i) => { n.time-=16; const a=Math.min(1,n.time/500); const ny=canvas.height-60-i*40;
        drawRoundRect(canvas.width/2-140,ny,280,34,8,`rgba(0,0,0,${0.7*a})`);
        ctx.fillStyle=`rgba(255,255,255,${a})`; ctx.font='13px Fredoka One'; ctx.textAlign='center'; ctx.fillText(n.text,canvas.width/2,ny+22); });
    ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='12px Nunito'; ctx.textAlign='center'; ctx.fillText('Z = Buy | X = Leave',canvas.width/2,sy+sh+20);
}

// ══════════════════════════════════════════════════════════════
// MAIN LOOP
// ══════════════════════════════════════════════════════════════
let lastTime = 0;
function gameLoop(ts) {
    const dt = Math.min(50, ts - lastTime); lastTime = ts; const time = ts;
    if (GS.shake.intensity > 0) { GS.shake.x=(Math.random()-0.5)*GS.shake.intensity; GS.shake.y=(Math.random()-0.5)*GS.shake.intensity; GS.shake.intensity*=0.9; if (GS.shake.intensity<0.5) { GS.shake.intensity=0; GS.shake.x=0; GS.shake.y=0; } }
    if (GS.transition.active) { if (GS.transition.phase==='out') { GS.transition.alpha+=0.04; if (GS.transition.alpha>=1) { GS.transition.phase='in'; if (GS.transition.callback) GS.transition.callback(); } } else { GS.transition.alpha-=0.04; if (GS.transition.alpha<=0) { GS.transition.active=false; GS.transition.alpha=0; } } }
    ctx.fillStyle='#0a0a1e'; ctx.fillRect(0,0,canvas.width,canvas.height);
    switch (GS.screen) {
        case 'title': updateTitle(); drawTitle(time); break;
        case 'world': updateWorld(dt); drawWorld(time); break;
        case 'dialogue': updateDialogue(dt); drawDialogue(time); break;
        case 'battle': updateBattle(dt); drawBattle(time); break;
        case 'menu': updateMenu(dt); drawMenu(time); break;
        case 'team_view': updateTeamView(dt); drawTeamView(time); break;
        case 'bag': updateBag(dt); drawBag(time); break;
        case 'quests': updateQuests(dt); drawQuests(time); break;
        case 'shop': updateShop(dt); drawShop(time); break;
        case 'starter_select': updateStarterSelect(dt); drawStarterSelect(time); break;
    }
    if (GS.transition.active) { ctx.fillStyle=`rgba(0,0,0,${GS.transition.alpha})`; ctx.fillRect(0,0,canvas.width,canvas.height); }
    lastAction=actionPressed(); lastCancel=cancelPressed();
    requestAnimationFrame(gameLoop);
}
