/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — VICTORYFX.JS
 * Gerador de Confetes e Partículas Festivas da Dança da Vitória
 * ============================================================================
 * - 140 partículas de confetes coloridos com física de queda, turbulência e rotação
 * - Cores vibrantes neon: Dourado (#ffd700), Ciano (#00f0ff), Magenta (#f43f5e),
 *   Verde Neon (#22c55e) e Roxo Neon (#a855f7)
 * - Luz pontual festiva dinâmica sincronizada com a dança
 * - Ativação no evento 'combat:victory' e desativação no 'combat:continue' / reset
 */

import * as THREE from 'three';

/**
 * Cria textura de confete nítida em canvas 32x32.
 * @returns {THREE.CanvasTexture}
 */
function createConfettiTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // Confete retangular / quadrado estilizado com bordas suaves
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, 4, 24, 24);

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

const CONFETTI_TEXTURE = createConfettiTexture();

const FESTIVE_COLORS = [
    new THREE.Color(0xffd700), // Dourado
    new THREE.Color(0x00f0ff), // Ciano Neon
    new THREE.Color(0xf43f5e), // Magenta vibrante
    new THREE.Color(0x22c55e), // Verde Neon
    new THREE.Color(0xa855f7), // Roxo Neon
    new THREE.Color(0xffffff)  // Branco Brilhante
];

export class VictoryFX {
    /**
     * @param {THREE.Scene} scene Cena principal Three.js
     * @param {import('../core/EventBus.js').EventBus} eventBus Barramento de eventos
     */
    constructor(scene, eventBus) {
        this.scene = scene;
        this.eventBus = eventBus;

        this.isActive = false;
        this.isBurstActive = false;
        this.delayTimer = 0.0;
        this.origin = new THREE.Vector3();
        this.confettiCount = 140;
        this.confettiData = [];

        // 1. Luz de Celebração Central
        this.celebrationLight = new THREE.PointLight(0x00f0ff, 0.0, 28.0, 1.0);
        this.celebrationLight.position.set(0, -100, 0);
        this.scene.add(this.celebrationLight);

        // 2. Sistema de Partículas de Confetes
        this.initConfettiSystem();

        // 3. Ouvintes de Eventos
        this.bindEvents();
    }

    /**
     * Inicializa o sistema de partículas com BufferGeometry e cores por vértice.
     */
    initConfettiSystem() {
        this.geo = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.confettiCount * 3);
        this.colors = new Float32Array(this.confettiCount * 3);
        this.sizes = new Float32Array(this.confettiCount);

        for (let i = 0; i < this.confettiCount; i++) {
            const color = FESTIVE_COLORS[i % FESTIVE_COLORS.length];
            this.colors[i * 3 + 0] = color.r;
            this.colors[i * 3 + 1] = color.g;
            this.colors[i * 3 + 2] = color.b;
            this.sizes[i] = 0.35 + Math.random() * 0.30;

            // Inicializar posições ocultas abaixo do chão
            this.positions[i * 3 + 0] = 0;
            this.positions[i * 3 + 1] = -100;
            this.positions[i * 3 + 2] = 0;

            this.confettiData.push({
                x: 0,
                y: -100,
                z: 0,
                vx: 0,
                vy: 0,
                vz: 0,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 8.0,
                flutterPhase: Math.random() * Math.PI * 2,
                life: 0.0,
                maxLife: 2.5 + Math.random() * 2.0
            });
        }

        this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

        this.mat = new THREE.PointsMaterial({
            size: 0.50,
            vertexColors: true,
            map: CONFETTI_TEXTURE,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            blending: THREE.NormalBlending
        });

        this.pointsMesh = new THREE.Points(this.geo, this.mat);
        this.pointsMesh.visible = false;
        this.scene.add(this.pointsMesh);
    }

    /**
     * Registra os eventos do barramento.
     */
    bindEvents() {
        this.eventBus.on('combat:victory', () => {
            this.activate();
        });

        this.eventBus.on('combat:continue', () => {
            this.deactivate();
        });

        this.eventBus.on('bot:resetPosition', () => {
            this.deactivate();
        });
    }

    /**
     * Ativa a celebração com um breve atraso sincronizado ao primeiro beat da dança.
     * @param {number} [delay=0.75] Atraso em segundos antes de disparar os confetes
     */
    activate(delay = 0.75) {
        this.isActive = true;
        this.isBurstActive = false;
        this.delayTimer = delay;
        this.pointsMesh.visible = false;
        this.mat.opacity = 0.0;
        this.celebrationLight.intensity = 0.0;

        // Ocultar partículas enquanto aguarda o atraso
        for (let i = 0; i < this.confettiCount; i++) {
            this.positions[i * 3 + 1] = -100;
        }
        if (this.geo && this.geo.attributes.position) {
            this.geo.attributes.position.needsUpdate = true;
        }
    }

    /**
     * Desativa o chafariz e apaga os confetes.
     */
    deactivate() {
        this.isActive = false;
        this.isBurstActive = false;
        this.delayTimer = 0.0;
        this.celebrationLight.intensity = 0.0;
        this.celebrationLight.position.set(0, -100, 0);

        if (this.mat) {
            this.mat.opacity = 0.0;
        }
        if (this.pointsMesh) {
            this.pointsMesh.visible = false;
        }

        // Mover partículas para fora da visão
        for (let i = 0; i < this.confettiCount; i++) {
            this.positions[i * 3 + 1] = -100;
        }
        if (this.geo && this.geo.attributes.position) {
            this.geo.attributes.position.needsUpdate = true;
        }
    }

    /**
     * Reinicializa uma partícula de confete em volta da origem do mecha.
     * @param {Object} d
     * @param {THREE.Vector3} origin
     */
    respawnParticle(d, origin) {
        const radius = Math.random() * 4.5;
        const angle = Math.random() * Math.PI * 2;
        d.x = origin.x + Math.cos(angle) * radius;
        d.y = origin.y + 1.2 + Math.random() * 1.5;
        d.z = origin.z + Math.sin(angle) * radius;

        const burstAngle = Math.random() * Math.PI * 2;
        const burstSpeed = 2.0 + Math.random() * 4.5;
        d.vx = Math.cos(burstAngle) * burstSpeed * 0.6;
        d.vy = 4.5 + Math.random() * 5.5; // Disparo ascendente
        d.vz = Math.sin(burstAngle) * burstSpeed * 0.6;

        d.life = 0.0;
        d.maxLife = 2.5 + Math.random() * 2.0;
        d.flutterPhase = Math.random() * Math.PI * 2;
    }

    /**
     * Atualiza o sistema de confetes e a luz dinâmica a cada frame.
     * @param {number} dt Delta time em segundos
     * @param {number} elapsedTime Tempo total decorrido
     * @param {THREE.Vector3} botPosition Posição central do HexaBOT
     * @param {Function} getTerrainHeightFn Função de altitude do solo
     */
    update(dt, elapsedTime, botPosition, getTerrainHeightFn) {
        if (!this.isActive) return;

        // Sempre capturar a posição em tempo real do HexaBOT antes de qualquer spawn
        this.origin.copy(botPosition);

        // Tratar o atraso inicial antes de estourar os confetes
        if (this.delayTimer > 0.0) {
            this.delayTimer -= dt;
            if (this.delayTimer <= 0.0) {
                this.isBurstActive = true;
                this.pointsMesh.visible = true;
                this.mat.opacity = 0.95;

                const posAttr = this.geo.attributes.position;
                // Disparo inicial dos confetes centralizado com precisão em volta do robô
                for (let i = 0; i < this.confettiCount; i++) {
                    const d = this.confettiData[i];
                    d.life = Math.random() * (d.maxLife * 0.4);
                    this.respawnParticle(d, this.origin);
                    posAttr.setXYZ(i, d.x, d.y, d.z);
                }
                posAttr.needsUpdate = true;
            } else {
                return; // Aguarda o término do atraso
            }
        }

        if (!this.isBurstActive) return;

        // Atualizar luz festiva pulsante alternando entre Ciano, Dourado e Magenta
        const colorCycle = (elapsedTime * 0.5) % 1.0;
        if (colorCycle < 0.33) {
            this.celebrationLight.color.setHex(0x00f0ff);
        } else if (colorCycle < 0.66) {
            this.celebrationLight.color.setHex(0xffd700);
        } else {
            this.celebrationLight.color.setHex(0xf43f5e);
        }

        const lightPulse = 24.0 + Math.sin(elapsedTime * 10.0) * 8.0;
        this.celebrationLight.intensity = lightPulse;
        this.celebrationLight.position.set(botPosition.x, botPosition.y + 3.0, botPosition.z);

        // Atualizar cada partícula de confete
        const posAttr = this.geo.attributes.position;
        const gravity = -5.8;
        const airResistance = 0.94;

        for (let i = 0; i < this.confettiCount; i++) {
            const d = this.confettiData[i];
            d.life += dt;

            if (d.life >= d.maxLife) {
                this.respawnParticle(d, this.origin);
            } else {
                // Gravidade com desaceleração e flutuação oscilante (Flutter)
                d.vy += gravity * dt;
                d.vx *= airResistance;
                d.vz *= airResistance;

                // Efeito de vento e folha seca caindo (Flutter horizontal)
                const flutter = Math.sin(elapsedTime * 6.0 + d.flutterPhase) * 1.2;
                d.x += (d.vx + flutter) * dt;
                d.y += d.vy * dt;
                d.z += (d.vz + Math.cos(elapsedTime * 6.0 + d.flutterPhase) * 1.2) * dt;

                // Limite com o chão da arena
                const groundY = getTerrainHeightFn ? getTerrainHeightFn(d.x, d.z) : 0;
                if (d.y < groundY + 0.05) {
                    d.y = groundY + 0.05;
                    d.vx *= 0.2;
                    d.vz *= 0.2;
                    d.vy = 0;
                }
            }

            posAttr.setXYZ(i, d.x, d.y, d.z);
        }

        posAttr.needsUpdate = true;
    }
}
