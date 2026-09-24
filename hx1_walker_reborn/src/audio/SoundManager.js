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
            if (this.listener && this.listener.context) {
                if (this.listener.context.state === 'suspended') {
                    this.listener.context.resume().then(() => {
                        this.isAudioUnlocked = true;
                    });
                } else {
                    this.isAudioUnlocked = true;
                }
            }
            window.removeEventListener('click', unlock);
            window.removeEventListener('keydown', unlock);
            window.removeEventListener('touchstart', unlock);
        };

        window.addEventListener('click', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
        window.addEventListener('touchstart', unlock, { once: true });
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
        // Fala da joaninha ao plantar bomba
        this.eventBus.on('sound:kaboom', (position) => {
            this.playKaboom(position);
        });

        // Som de explosão/pop ao morrer
        this.eventBus.on('sound:pop', (position) => {
            this.playPop(position);
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
    startLaser(position = null, targetVolume = 1.6, attackTime = 0.08) {
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
}
