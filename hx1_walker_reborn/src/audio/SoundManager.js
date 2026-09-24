/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — SOUNDMANAGER.JS
 * Gerenciador de Áudio Espacial e Efeitos Sonoros (Three.js Web Audio)
 * ============================================================================
 * Responsável por:
 * 1. Inicializar e gerenciar THREE.AudioListener e THREE.AudioLoader.
 * 2. Tratar a política de Autoplay dos navegadores (desbloqueio no primeiro clique/tecla).
 * 3. Reproduzir o áudio 3D posicional "Kaboom! Hahahahaha!" das joaninhas com variação de pitch.
 */

import * as THREE from 'three';

export class SoundManager {
    /**
     * @param {THREE.Camera} camera Câmera principal da cena (para o AudioListener)
     * @param {THREE.Scene} scene Cena Three.js
     * @param {import('../core/EventBus.js').EventBus} eventBus Barramento de eventos
     */
    constructor(camera, scene, eventBus) {
        this.camera = camera;
        this.scene = scene;
        this.eventBus = eventBus;

        // 1. Inicializar AudioListener e anexar à câmera
        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);

        // 2. Carregador de Buffers de Áudio
        this.audioLoader = new THREE.AudioLoader();
        this.audioBuffers = new Map();
        this.isAudioUnlocked = false;

        // 3. Ouvintes para desbloquear o AudioContext no primeiro gesto do usuário
        this.setupAutoplayUnlock();

        // 4. Pré-carregar os áudios do jogo
        this.loadSound('kaboom', './assets/mp3/kaboom.mp3');
        this.loadSound('pop', './assets/mp3/pop.mp3');
        this.loadSound('laser', './assets/mp3/laser.mp3');
        this.loadSound('booom_1', './assets/mp3/booom_1.mp3');
        this.loadSound('glitch_1', './assets/mp3/glitch_1.mp3');
        this.loadSound('glitch_2', './assets/mp3/glitch_2.mp3');
        this.loadSound('ambient_loop', './assets/mp3/ambient_loop.mp3');
        this.loadSound('intro', './assets/mp3/intro.mp3');
        this.loadSound('step_1', './assets/mp3/step_1.mp3');
        this.loadSound('motor', './assets/mp3/motor.mp3');
        this.loadSound('tribal', './assets/mp3/tribal.mp3');

        // Estado do Som Ambiente e Intro
        this.ambientSound = null;
        this.tribalSound = null;
        this.hasStartedAmbient = false;
        this.hasPlayedInitialIntro = false;
        this.pendingIntroPlay = false;

        // Estado do Servomotor de Rotação/Torção Contínuo (motor.mp3)
        this.motorSound = null;
        this.isMotorPlaying = false;
        this.currentMotorPitch = 0.35;
        this.currentMotorIntensity = 0.0;

        // Estado do Laser Contínuo (Envelope ADSR)
        this.laserSound = null;
        this.laserHolder = null;
        this.isLaserPlaying = false;

        // 5. Registrar ouvintes no Barramento de Eventos
        this.setupEventListeners();
    }

    /**
     * Desbloqueia o AudioContext no primeiro clique ou tecla do usuário.
     */
    setupAutoplayUnlock() {
        const unlock = () => {
            this.unlockAudio();
            window.removeEventListener('click', unlock);
            window.removeEventListener('keydown', unlock);
            window.removeEventListener('touchstart', unlock);
        };

        window.addEventListener('click', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
        window.addEventListener('touchstart', unlock, { once: true });
    }

    /**
     * Desbloqueia ativamente o Web Audio Context.
     */
    unlockAudio() {
        if (this.listener && this.listener.context) {
            if (this.listener.context.state === 'suspended') {
                this.listener.context.resume().then(() => {
                    this.isAudioUnlocked = true;
                    this.onAudioUnlocked();
                }).catch((e) => {
                    console.warn('[SoundManager] Erro ao retomar AudioContext:', e);
                });
            } else {
                this.isAudioUnlocked = true;
                this.onAudioUnlocked();
            }
        } else {
            this.isAudioUnlocked = true;
            this.onAudioUnlocked();
        }
    }

    /**
     * Ações disparadas no primeiro gesto do usuário ou no botão de Iniciar.
     */
    onAudioUnlocked() {
        this.isAudioUnlocked = true;

        // 1. Iniciar áudio ambiente sutil de fundo
        if (!this.hasStartedAmbient) {
            this.startAmbientLoop();
        }

        // 2. Iniciar trilha de servomotores em silêncio (aguardando movimento)
        if (!this.motorSound) {
            this.initMotorSound();
        }

        // 3. Tocar som de intro na primeira interação / start
        if (!this.hasPlayedInitialIntro) {
            this.playIntro();
        }
    }

    /**
     * Carrega e armazena em cache um arquivo de áudio.
     * @param {string} name Identificador do som
     * @param {string} url Caminho relativo do arquivo
     */
    loadSound(name, url) {
        this.audioLoader.load(
            url,
            (buffer) => {
                this.audioBuffers.set(name, buffer);
                console.log(`[SoundManager] Áudio carregado: '${name}'`);

                // Se o som ambiente carregou após o desbloqueio do áudio, inicia imediatamente
                if (name === 'ambient_loop' && this.isAudioUnlocked && !this.hasStartedAmbient) {
                    this.startAmbientLoop();
                }

                // Se o motor carregou após o desbloqueio, inicializa o canal
                if (name === 'motor' && this.isAudioUnlocked && !this.motorSound) {
                    this.initMotorSound();
                }

                // Se a intro carregou após desbloqueio ou estava pendente, dispara
                if (name === 'intro' && (this.isAudioUnlocked || this.pendingIntroPlay) && !this.hasPlayedInitialIntro) {
                    this.playIntro();
                }
            },
            undefined,
            (err) => {
                console.warn(`[SoundManager] Falha ao carregar áudio '${name}':`, err);
            }
        );
    }

    /**
     * Registra ouvintes do barramento de eventos.
     */
    setupEventListeners() {
        // Inicialização do Jogo / Start Mission
        this.eventBus.on('game:start', () => {
            this.unlockAudio();
            this.playIntro(0.90);
        });

        // Som de Intro e Restauração da HX (Boot / Reset / Nova Fase)
        this.eventBus.on('sound:intro', (volume) => {
            this.playIntro(volume || 0.90);
        });

        this.eventBus.on('bot:resetPosition', () => {
            this.stopTribalMusic();
            this.playIntro(0.90);
        });

        // Música da Dança Ritual Tribal das Joaninhas (disparada quando a 1ª joaninha entra no círculo)
        this.eventBus.on('music:tribalStart', () => {
            this.startTribalMusic(0.85);
        });

        // Controle do som ambiente
        this.eventBus.on('sound:ambientStart', (volume) => {
            this.startAmbientLoop(volume);
        });

        // Fala da joaninha ao plantar bomba
        this.eventBus.on('sound:kaboom', (position) => {
            this.playKaboom(position);
        });

        // Som de explosão/pop ao morrer
        this.eventBus.on('sound:pop', (position) => {
            this.playPop(position);
        });

        // Passos da Aranha (Impacto no Solo / Touchdown)
        this.eventBus.on('sound:step', (position) => {
            this.playStep(position);
        });

        this.eventBus.on('bot:step', (position) => {
            this.playStep(position);
        });

        // Modulação Dinâmica dos Servomotores de Rotação e Torção do Tronco (motor.mp3)
        this.eventBus.on('bot:motorUpdate', (data) => {
            this.updateMotorSound(data);
        });

        // Laser contínuo com envelope ADSR
        this.eventBus.on('sound:laserStart', (position) => {
            this.startLaser(position);
        });

        this.eventBus.on('sound:laserStop', () => {
            this.stopLaser();
        });

        // Detonação da Bomba das Joaninhas ("Booom!")
        this.eventBus.on('sound:bombExplosion', (position) => {
            this.playBombExplosion(position);
        });

        // Som de Tilt / Glitch das Cabines Sofrendo Sobrecarga
        this.eventBus.on('sound:glitch', (position) => {
            this.playGlitch(position);
        });

        // Som Terminal de Destruição / Glitch 2 da Cabine
        this.eventBus.on('sound:cabinDestroyed', (position) => {
            this.playCabinDestroyed(position);
        });
    }

    /**
     * Inicia ou sustenta o áudio contínuo do laser com rampa suave de ataque (Attack & Sustain Loop).
     * @param {THREE.Vector3} [position] Posição 3D da boca do canhão
     * @param {number} [targetVolume=1.6] Volume de sustentação
     * @param {number} [attackTime=0.08] Tempo de subida do ataque em segundos
     */
    startLaser(position = null, targetVolume = 2.6, attackTime = 0.08) {
        const buffer = this.audioBuffers.get('laser');
        if (!buffer) return;

        if (this.listener.context && this.listener.context.state === 'suspended') {
            this.listener.context.resume();
        }

        const now = this.listener.context.currentTime;

        if (!this.isLaserPlaying || !this.laserSound) {
            // Criar e posicionar suporte 3D
            if (!this.laserHolder) {
                this.laserHolder = new THREE.Object3D();
                this.scene.add(this.laserHolder);
            }
            if (position) {
                this.laserHolder.position.copy(position);
            }

            this.laserSound = new THREE.PositionalAudio(this.listener);
            this.laserSound.setBuffer(buffer);
            this.laserSound.setLoop(true); // Loop infinito durante o Sustain
            this.laserSound.setRefDistance(22.0);
            this.laserSound.setMaxDistance(120.0);
            this.laserSound.setRolloffFactor(0.75);

            // Iniciar com ganho nulo para aplicar a rampa de Attack
            this.laserSound.gain.gain.setValueAtTime(0.0001, now);

            this.laserHolder.add(this.laserSound);
            this.laserSound.play();
            this.isLaserPlaying = true;
        }

        if (position && this.laserHolder) {
            this.laserHolder.position.copy(position);
        }

        // Envelope ADSR — Ataque (Attack): Ganho sobe suavemente sem cortes
        if (this.laserSound && this.laserSound.gain) {
            const gainParam = this.laserSound.gain.gain;
            gainParam.cancelScheduledValues(now);
            gainParam.setTargetAtTime(targetVolume, now, attackTime);
        }
    }

    /**
     * Interrompe o laser com rampa de decaimento suave (Decay / Release).
     * @param {number} [decayTime=0.18] Tempo de decaimento em segundos
     */
    stopLaser(decayTime = 0.18) {
        if (!this.isLaserPlaying || !this.laserSound) return;

        const now = this.listener.context.currentTime;

        // Envelope ADSR — Decaimento (Decay / Release): Volume cai suavemente para zero
        if (this.laserSound && this.laserSound.gain) {
            const gainParam = this.laserSound.gain.gain;
            gainParam.cancelScheduledValues(now);
            gainParam.setTargetAtTime(0.0001, now, decayTime);
        }

        this.isLaserPlaying = false;
        const currentSound = this.laserSound;
        this.laserSound = null;

        // Desconectar e liberar nó de áudio após a cauda
        setTimeout(() => {
            if (currentSound) {
                try {
                    if (currentSound.isPlaying) currentSound.stop();
                    if (this.laserHolder) this.laserHolder.remove(currentSound);
                    currentSound.disconnect();
                } catch (_) {}
            }
        }, (decayTime * 1000) + 60);
    }

    /**
     * Reproduz áudio espacial 3D genérico com tratamento de ciclo de vida e pitch orgânico.
     */
    playSound(name, position = null, { volume = 1.0, refDistance = 15.0, maxDistance = 100.0, rolloffFactor = 0.8, pitchMin = 0.95, pitchMax = 1.05 } = {}) {
        const buffer = this.audioBuffers.get(name);
        if (!buffer) return;

        // Desbloquear contexto se necessário
        if (this.listener.context && this.listener.context.state === 'suspended') {
            this.listener.context.resume();
        }

        const pitch = pitchMin + Math.random() * (pitchMax - pitchMin);

        if (position) {
            const sound = new THREE.PositionalAudio(this.listener);
            sound.setBuffer(buffer);
            sound.setRefDistance(refDistance);
            sound.setMaxDistance(maxDistance);
            sound.setRolloffFactor(rolloffFactor);
            sound.setVolume(volume);
            sound.setPlaybackRate(pitch);

            const soundHolder = new THREE.Object3D();
            soundHolder.position.copy(position);
            this.scene.add(soundHolder);
            soundHolder.add(sound);

            sound.play();

            sound.onEnded = () => {
                soundHolder.remove(sound);
                this.scene.remove(soundHolder);
                sound.disconnect();
            };
        } else {
            const sound = new THREE.Audio(this.listener);
            sound.setBuffer(buffer);
            sound.setVolume(volume);
            sound.setPlaybackRate(pitch);
            sound.play();
        }
    }

    /**
     * Reproduz o efeito sonoro "Kaboom! Hahahahaha!" com áudio espacial 3D.
     */
    playKaboom(position = null, volume = 1.8) {
        this.playSound('kaboom', position, {
            volume,
            refDistance: 22.0,
            maxDistance: 110.0,
            rolloffFactor: 0.8,
            pitchMin: 0.94,
            pitchMax: 1.08
        });
    }

    /**
     * Reproduz o efeito sonoro "Pop!" ao abater uma joaninha com presença reforçada.
     */
    playPop(position = null, volume = 2.4) {
        this.playSound('pop', position, {
            volume,
            refDistance: 26.0,
            maxDistance: 120.0,
            rolloffFactor: 0.7,
            pitchMin: 0.94,
            pitchMax: 1.14
        });
    }

    /**
     * Reproduz a explosão em área da bomba ("Booom!").
     * @param {THREE.Vector3} [position] Posição 3D da bomba no solo
     * @param {number} [volume=2.6] Volume de reprodução
     */
    playBombExplosion(position = null, volume = 2.6) {
        this.playSound('booom_1', position, {
            volume,
            refDistance: 30.0,
            maxDistance: 140.0,
            rolloffFactor: 0.65,
            pitchMin: 0.92,
            pitchMax: 1.08
        });
    }

    /**
     * Reproduz o som de tilt / glitch eletrônico da cabine sofrendo sobrecarga.
     * @param {THREE.Vector3} [position] Posição 3D da cabine
     * @param {number} [volume=2.4] Volume de reprodução
     */
    playGlitch(position = null, volume = 2.4) {
        this.playSound('glitch_1', position, {
            volume,
            refDistance: 28.0,
            maxDistance: 130.0,
            rolloffFactor: 0.70,
            pitchMin: 0.90,
            pitchMax: 1.15
        });
    }

    /**
     * Reproduz o som de destruição catastrófica / glitch terminal da cabine ("glitch_2").
     * @param {THREE.Vector3} [position] Posição 3D da cabine
     * @param {number} [volume=2.6] Volume de reprodução
     */
    playCabinDestroyed(position = null, volume = 2.6) {
        this.playSound('glitch_2', position, {
            volume,
            refDistance: 32.0,
            maxDistance: 140.0,
            rolloffFactor: 0.65,
            pitchMin: 0.94,
            pitchMax: 1.06
        });
    }

    /**
     * Inicia o áudio ambiente contínuo de fundo (loop global sutil).
     * @param {number} [volume=0.35] Volume sutil de fundo
     */
    startAmbientLoop(volume = 0.35) {
        const buffer = this.audioBuffers.get('ambient_loop');
        if (!buffer) return;

        if (this.listener.context && this.listener.context.state === 'suspended') {
            this.listener.context.resume();
        }

        if (!this.ambientSound) {
            this.ambientSound = new THREE.Audio(this.listener);
            this.ambientSound.setBuffer(buffer);
            this.ambientSound.setLoop(true);
            this.ambientSound.setVolume(volume);
            this.ambientSound.play();
            this.hasStartedAmbient = true;
        } else if (!this.ambientSound.isPlaying) {
            this.ambientSound.play();
        }
    }

    /**
     * Toca o áudio de inicialização / restauração da HX / início de partida ("intro").
     * @param {number} [volume=0.90] Volume de reprodução
     */
    playIntro(volume = 0.90) {
        const buffer = this.audioBuffers.get('intro');
        if (!buffer) {
            this.pendingIntroPlay = true;
            return;
        }

        if (this.listener && this.listener.context && this.listener.context.state === 'suspended') {
            this.listener.context.resume();
        }

        try {
            const sound = new THREE.Audio(this.listener);
            sound.setBuffer(buffer);
            sound.setVolume(volume);
            sound.play();
            this.hasPlayedInitialIntro = true;
            this.pendingIntroPlay = false;
        } catch (e) {
            console.warn('[SoundManager] Erro ao reproduzir intro:', e);
        }
    }

    /**
     * Reproduz o impacto mecânico da pata no solo ("step_1") com áudio posicional e micro-variação de pitch/volume.
     * @param {THREE.Vector3} [position] Posição 3D do impacto
     * @param {number} [volume=0.75] Volume base do passo
     */
    playStep(position = null, volume = 0.75) {
        // Micro-variação de volume orgânico para naturalidade
        const organicVol = volume * (0.88 + Math.random() * 0.24);

        this.playSound('step_1', position, {
            volume: organicVol,
            refDistance: 20.0,
            maxDistance: 95.0,
            rolloffFactor: 0.75,
            pitchMin: 0.93,
            pitchMax: 1.07
        });
    }

    /**
     * Inicializa a trilha contínua do servomotor em loop (motor.mp3) com ganho silencioso inicial.
     */
    initMotorSound() {
        const buffer = this.audioBuffers.get('motor');
        if (!buffer || this.motorSound) return;

        if (this.listener.context && this.listener.context.state === 'suspended') {
            this.listener.context.resume();
        }

        try {
            this.motorSound = new THREE.Audio(this.listener);
            this.motorSound.setBuffer(buffer);
            this.motorSound.setLoop(true);
            this.motorSound.setVolume(0.0001);
            this.motorSound.setPlaybackRate(0.50);
            this.motorSound.play();
            this.isMotorPlaying = true;
            console.log('[SoundManager] Canal contínuo do servomotor (motor.mp3) inicializado.');
        } catch (e) {
            console.warn('[SoundManager] Erro ao inicializar motorSound:', e);
        }
    }

    /**
     * Modula dinamicamente em tempo real o volume e o pitch do servomotor com base na física da aranha.
     * @param {Object} params Parâmetros de movimento
     * @param {number} params.angularSpeed Velocidade angular em rad/s (Yaw, Pitch e Roll combinados)
     * @param {boolean} params.isMoving Se o robô está se deslocando
     * @param {boolean} params.isTurningInPlace Se está executando pivô
     * @param {number} params.moveSpeed Velocidade linear de avanço
     * @param {number} [params.dt=0.016] Delta time em segundos para amortecimento
     */
    updateMotorSound({ angularSpeed = 0, isMoving = false, isTurningInPlace = false, moveSpeed = 16.0, dt = 0.016 } = {}) {
        if (!this.motorSound) {
            if (this.isAudioUnlocked && this.audioBuffers.has('motor')) {
                this.initMotorSound();
            }
            return;
        }

        if (!this.motorSound.isPlaying) {
            try { this.motorSound.play(); } catch (_) {}
        }

        if (this.listener.context && this.listener.context.state === 'suspended') {
            return;
        }

        const now = this.listener.context.currentTime;
        const gainParam = this.motorSound.gain.gain;

        // Normalização da rotação/torção (0 a 1) com saturação em ~2.2 rad/s (~126°/s)
        const angNorm = THREE.MathUtils.clamp(angularSpeed / 2.2, 0.0, 1.0);

        // Contribuição sutil do deslocamento linear
        const linNorm = isMoving ? THREE.MathUtils.clamp(moveSpeed / 16.0, 0.0, 1.0) * 0.35 : 0.0;

        // Intensidade alvo do esforço mecânico
        const targetIntensity = Math.max(angNorm, linNorm);

        // Amortecimento (Damping) na intensidade para eliminar saltos bruscos entre passos de pivô
        const dampFactor = isTurningInPlace ? 10.0 : 15.0;
        this.currentMotorIntensity = THREE.MathUtils.damp(this.currentMotorIntensity, targetIntensity, dampFactor, dt);

        if (this.currentMotorIntensity > 0.02) {
            // Volume suave e atenuado: de 0.03 até 0.22
            const targetVol = 0.03 + Math.pow(this.currentMotorIntensity, 0.9) * 0.19;

            // Pitch dinâmico com amortecimento (Damping) suave: de 0.35x (sub-grave) até 0.95x (alta rotação)
            const targetPitch = 0.15 + Math.pow(this.currentMotorIntensity, 3.50) * 0.50;
            this.currentMotorPitch = THREE.MathUtils.damp(this.currentMotorPitch, targetPitch, dampFactor, dt);

            gainParam.cancelScheduledValues(now);
            gainParam.setTargetAtTime(targetVol, now, 0.06);

            this.motorSound.setPlaybackRate(this.currentMotorPitch);
        } else {
            // Desaceleração suave e amortecida para silêncio
            this.currentMotorPitch = THREE.MathUtils.damp(this.currentMotorPitch, 0.35, dampFactor, dt);
            gainParam.cancelScheduledValues(now);
            gainParam.setTargetAtTime(0.0001, now, 0.09);
            this.motorSound.setPlaybackRate(this.currentMotorPitch);
        }
    }

    /**
     * Inicia a música tema da dança ritual/tribal de comemoração das joaninhas (tribal.mp3).
     * @param {number} [volume=0.85] Volume de reprodução
     */
    startTribalMusic(volume = 0.85) {
        const buffer = this.audioBuffers.get('tribal');
        if (!buffer) return;

        if (this.listener.context && this.listener.context.state === 'suspended') {
            this.listener.context.resume();
        }

        // Atenuar a trilha ambiente padrão enquanto o tribal toca
        if (this.ambientSound && this.ambientSound.isPlaying) {
            this.ambientSound.setVolume(0.06);
        }

        try {
            if (!this.tribalSound) {
                this.tribalSound = new THREE.Audio(this.listener);
                this.tribalSound.setBuffer(buffer);
                this.tribalSound.setLoop(true);
                this.tribalSound.setVolume(volume);
                this.tribalSound.play();
                console.log('[SoundManager] Trilha tribal das joaninhas (tribal.mp3) iniciada.');
            } else if (!this.tribalSound.isPlaying) {
                this.tribalSound.setVolume(volume);
                this.tribalSound.play();
            }
        } catch (e) {
            console.warn('[SoundManager] Erro ao reproduzir trilha tribal:', e);
        }
    }

    /**
     * Interrompe a música tribal e restaura o volume da trilha ambiente padrão.
     */
    stopTribalMusic() {
        if (this.tribalSound && this.tribalSound.isPlaying) {
            this.tribalSound.stop();
        }

        // Restaurar volume normal do ambiente de fundo
        if (this.ambientSound && this.ambientSound.isPlaying) {
            this.ambientSound.setVolume(0.35);
        }
    }
}
