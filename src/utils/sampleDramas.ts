import { DramaProject } from '../types/drama';

export const SAMPLE_DRAMAS: Record<string, Partial<DramaProject> & { transcript: string }> = {
  cyberpunk: {
    id: 'cyberpunk-heist',
    title: 'Neon Vault 7: The Final Decryption',
    genre: 'Cyberpunk Thriller',
    transcript: `VEX: The firewall has thirteen quantum layers. Hand me the neuro-jack, Nyx.
[sci_fi_hum]
NYX (whispering): Hurry! The orbital drones just completed their sweep. <gasp> Wait, someone is already inside the server room!
VEX: |yeah|, it's the warden's synthetic clone. Keep quiet and sync your scrambler.
[footsteps]
AI OVERLORD (cold, mechanical): Unauthorized bio-signatures detected in sector nine. Initiating neural lockdown in ten seconds.
NYX (panicked): Vex, run! <breath> It's an ambush!
VEX: Not before I pull this decryption key! <laugh> See you in cyberspace, bucket of bolts!`,
    characters: [
      {
        id: 'char-1',
        name: 'VEX',
        voiceName: 'Puck',
        stylePrompt: 'Daring, gritty cyberpunk hacker, witty under pressure',
        color: '#06b6d4', // Cyan
        description: 'Elite netrunner hacking the orbital data vault',
      },
      {
        id: 'char-2',
        name: 'NYX',
        voiceName: 'Kore',
        stylePrompt: 'Tense, breathless, urgent whisper and panic',
        color: '#ec4899', // Pink
        description: 'Vex’s tech scout monitoring drone perimeters',
      },
      {
        id: 'char-3',
        name: 'AI OVERLORD',
        voiceName: 'Charon',
        stylePrompt: 'Cold, resonant, chillingly emotionless robotic authority',
        color: '#a855f7', // Purple
        description: 'Automated mainframe security protocol',
      },
    ],
  },
  noir: {
    id: 'noir-detective',
    title: 'The Rain on 5th & Hollow',
    genre: 'Classic Film Noir',
    transcript: `DETECTIVE VANCE: The rain in this town doesn't wash away sins. It just turns them to mud.
[rain]
LOLA (sultry, enigmatic): You shouldn't have come here, Vance. The Maltese seal wasn't meant for mortal hands. <breath>
DETECTIVE VANCE: |yeah|, and your husband wasn't meant to take a swan dive off the Brooklyn pier.
[thunder]
LOLA: He knew too much. |mhm| Just like you do right now. Put the revolver on the desk, detective.
DETECTIVE VANCE (smirking): You know me, Lola. <laugh> I never leave home without a loaded cylinder and a broken heart.`,
    characters: [
      {
        id: 'char-vance',
        name: 'DETECTIVE VANCE',
        voiceName: 'Fenrir',
        stylePrompt: 'Weary, gravelly 1940s private eye, cynical and dry',
        color: '#f59e0b', // Amber
        description: 'Hard-boiled private investigator',
      },
      {
        id: 'char-lola',
        name: 'LOLA',
        voiceName: 'Aoede',
        stylePrompt: 'Velvety, dangerous femme fatale, whispering seductively',
        color: '#ef4444', // Red
        description: 'Enigmatic widow with a deadly secret',
      },
    ],
  },
  horror: {
    id: 'gothic-horror',
    title: 'The Whisper of Blackwood Manor',
    genre: 'Gothic Horror',
    transcript: `NARRATOR: The iron gates groaned under the howling October gale as Evelyn stepped onto the rotting porch.
[door_creak]
EVELYN (trembling): Is anyone there? Father Thomas? <gasp> The candle just went out!
[heartbeat]
THE SPECTER (chilling, hollow): You brought him back... why did you disturb the crypt beneath the chapel floor?
EVELYN (crying out): Leave me alone! <breath> In God's name, return to your ashes!
THE SPECTER: Too late, child. <laugh> We feast together tonight!`,
    characters: [
      {
        id: 'char-narrator',
        name: 'NARRATOR',
        voiceName: 'Charon',
        stylePrompt: 'Deep, atmospheric, solemn gothic storyteller',
        color: '#64748b', // Slate
        description: 'Ominous narrator setting the macabre scene',
      },
      {
        id: 'char-evelyn',
        name: 'EVELYN',
        voiceName: 'Zephyr',
        stylePrompt: 'Terrified, breathless, shivering with intense fright',
        color: '#38bdf8', // Light blue
        description: 'Young heiress exploring her cursed ancestral estate',
      },
      {
        id: 'char-specter',
        name: 'THE SPECTER',
        voiceName: 'Fenrir',
        stylePrompt: 'Ghastly, guttural, venomous evil phantom whisper',
        color: '#10b981', // Emerald ghost
        description: 'The malevolent spirit bound to the cellar crypt',
      },
    ],
  },
  scifi: {
    id: 'scifi-europa',
    title: 'Descent to the Europan Ocean',
    genre: 'Hard Sci-Fi Mystery',
    transcript: `COMMANDER CHEN: Submersible probe Titan-3 has penetrated the outer ice crust. Depth: four kilometers.
[space_drone]
DR. ARIS (awe-struck): Chen, look at the external sonogram! Those aren't hydrothermal vents... <gasp> They are geometric structures!
COMMANDER CHEN: Confirming bio-luminescent signatures. |yeah|, it looks like an entire sunken metropolis!
DR. ARIS: Something is pinging our hull in prime numbers. <breath> They know we are here.
COMMANDER CHEN: All hands, prepare emergency ascent thrusters! Now!`,
    characters: [
      {
        id: 'char-chen',
        name: 'COMMANDER CHEN',
        voiceName: 'Charon',
        stylePrompt: 'Authoritative, disciplined naval spacecraft commander',
        color: '#3b82f6',
        description: 'Mission leader on exploration probe',
      },
      {
        id: 'char-aris',
        name: 'DR. ARIS',
        voiceName: 'Kore',
        stylePrompt: 'Intelligent, passionate scientist breathless with wonder and dread',
        color: '#10b981',
        description: 'Astrobiologist examining alien signals',
      },
    ],
  },
};
