/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — TRIBALFX.JS
 * Gerador de Partículas de Fogo, Fumaça e Brilho Dinâmico da Cena Tribal
 * ============================================================================
 * - Chamas, brasas incandescentes e faíscas em Additive Blending (Zero GC)
 * - Fumaça volumétrica escura/alaranjada ondulante
 * - Faíscas no rastro do círculo das joaninhas
 * - Luz de fogueira pulsante (Flickering Campfire Light) que ilumina a arena
 * - Ativação sincronizada no ritual tribal e desativação no reset (<kbd>R</kbd>)
 */

import * as THREE from 'three';

/**
 * Cria texturas procedurais suaves de alta performance em canvas 64x64.
 * @param {'fire'|'smoke'} type
 * @returns {THREE.CanvasTexture}
 */
function createParticleTexture(type = 'fire') {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (type === 'fire') {
        grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.2, 'rgba(255, 220, 90, 0.95)');
        grad.addColorStop(0.5, 'rgba(255, 90, 10, 0.60)');
        grad.addColorStop(0.8, 'rgba(200, 30, 0, 0.20)');
        grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    } else {
        grad.addColorStop(0.0, 'rgba(140, 110, 90, 0.65)');
        grad.addColorStop(0.35, 'rgba(90, 75, 65, 0.40)');
        grad.addColorStop(0.7, 'rgba(50, 40, 35, 0.15)');
        grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

const FIRE_TEXTURE = createParticleTexture('fire');
const SMOKE_TEXTURE = createParticleTexture('smoke');

export class TribalFX {
    /**
     * @param {THREE.Scene} scene Cena Three.js
     * @param {import('../core/EventBus.js').EventBus} eventBus Barramento de eventos
     */
    constructor(scene, eventBus) {
        this.scene = scene;
        this.eventBus = eventBus;

        this.isActive = false;
        this.origin = new THREE.Vector3();
        this.intensity = 0.0;

        // 1. Luz de Fogueira Pulsante Central
        this.campfireLight = new THREE.PointLight(0xff6600, 0.0, 26.0, 1.1);
        this.campfireLight.position.set(0, -100, 0);
        this.scene.add(this.campfireLight);

        // 2. Sistema de Partículas de Fogo & Brasas (120 partículas)
        this.fireCount = 120;
        this.fireData = [];
        this.initFireSystem();

        // 3. Sistema de Fumaça Ondulante (50 partículas)
        this.smokeCount = 50;
        this.smokeData = [];
        this.initSmokeSystem();

        // 4. Faíscas no Rastro do Círculo das Joaninhas (60 partículas)
        this.sparkCount = 60;
        this.sparkData = [];
        this.initSparkSystem();

        // Registrar ouvintes de eventos
        this.bindEvents();
    }

    /**
     * Registra os eventos de acionamento e reset.
     */
    bindEvents() {
        // Dispara o clima de fogo e fumaça quando o ritual tribal inicia
        this.eventBus.on('music:tribalStart', () => {
            this.activate();
        });

        // Apaga e reseta o fogo ao reiniciar a partida
        this.eventBus.on('bot:resetPosition', () => {
            this.deactivate();
        });
    }

    /**
     * Inicializa a malha e os buffers do fogo central.
     */
    initFireSystem() {
        this.fireGeo = new THREE.BufferGeometry();
        this.firePos = new Float32Array(this.fireCount * 3);
        this.fireCol = new Float32Array(this.fireCount * 3);
        this.fireSizes = new Float32Array(this.fireCount);

        for (let i = 0; i < this.fireCount; i++) {
            this.firePos[i * 3 + 1] = -100.0; // Fora da vista inicial
            this.fireSizes[i] = 0.0;

            this.fireData.push({
                x: 0, y: -100, z: 0,
                vx: 0, vy: 0, vz: 0,
                life: 0,
                maxLife: 1.0,
                baseSize: 1.2 + Math.random() * 1.5,
                swirlOffset: Math.random() * Math.PI * 2,
                swirlRadius: 0.2 + Math.random() * 1.6
            });
        }

        this.fireGeo.setAttribute('position', new THREE.BufferAttribute(this.firePos, 3));
        this.fireGeo.setAttribute('color', new THREE.BufferAttribute(this.fireCol, 3));
        this.fireGeo.setAttribute('size', new THREE.BufferAttribute(this.fireSizes, 1));

        this.fireMat = new THREE.PointsMaterial({
            size: 1.5,
            map: FIRE_TEXTURE,
            transparent: true,
            opacity: 0.0,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });

        this.firePoints = new THREE.Points(this.fireGeo, this.fireMat);
        this.firePoints.frustumCulled = false;
        this.scene.add(this.firePoints);
    }

    /**
     * Inicializa a malha e os buffers da fumaça.
     */
    initSmokeSystem() {
        this.smokeGeo = new THREE.BufferGeometry();
        this.smokePos = new Float32Array(this.smokeCount * 3);
        this.smokeCol = new Float32Array(this.smokeCount * 3);
        this.smokeSizes = new Float32Array(this.smokeCount);

        for (let i = 0; i < this.smokeCount; i++) {
            this.smokePos[i * 3 + 1] = -100.0;
            this.smokeSizes[i] = 0.0;

            this.smokeData.push({
                x: 0, y: -100, z: 0,
                vx: 0, vy: 0, vz: 0,
                life: 0,
                maxLife: 2.2 + Math.random() * 1.6,
                startSize: 1.0 + Math.random() * 0.8,
                endSize: 3.8 + Math.random() * 2.2,
                driftAngle: Math.random() * Math.PI * 2
            });
        }

        this.smokeGeo.setAttribute('position', new THREE.BufferAttribute(this.smokePos, 3));
        this.smokeGeo.setAttribute('color', new THREE.BufferAttribute(this.smokeCol, 3));
        this.smokeGeo.setAttribute('size', new THREE.BufferAttribute(this.smokeSizes, 1));

        this.smokeMat = new THREE.PointsMaterial({
            size: 2.5,
            map: SMOKE_TEXTURE,
            transparent: true,
            opacity: 0.0,
            vertexColors: true,
            blending: THREE.NormalBlending,
            depthWrite: false,
            sizeAttenuation: true
        });

        this.smokePoints = new THREE.Points(this.smokeGeo, this.smokeMat);
        this.smokePoints.frustumCulled = false;
        this.scene.add(this.smokePoints);
    }

    /**
     * Inicializa faíscas ao longo do anel de 8.2m das joaninhas.
     */
    initSparkSystem() {
        this.sparkGeo = new THREE.BufferGeometry();
        this.sparkPos = new Float32Array(this.sparkCount * 3);
        this.sparkCol = new Float32Array(this.sparkCount * 3);
        this.sparkSizes = new Float32Array(this.sparkCount);

        for (let i = 0; i < this.sparkCount; i++) {
            this.sparkPos[i * 3 + 1] = -100.0;
            this.sparkSizes[i] = 0.0;

            this.sparkData.push({
                x: 0, y: -100, z: 0,
                vx: 0, vy: 0, vz: 0,
                life: 0,
                maxLife: 0.6 + Math.random() * 0.8,
                baseSize: 0.4 + Math.random() * 0.6,
                angle: Math.random() * Math.PI * 2
            });
        }

        this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
        this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
        this.sparkGeo.setAttribute('size', new THREE.BufferAttribute(this.sparkSizes, 1));

        this.sparkMat = new THREE.PointsMaterial({
            size: 0.8,
            map: FIRE_TEXTURE,
            transparent: true,
            opacity: 0.0,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });

        this.sparkPoints = new THREE.Points(this.sparkGeo, this.sparkMat);
        this.sparkPoints.frustumCulled = false;
        this.scene.add(this.sparkPoints);
    }

    /**
     * Ativa o clima visual tribal.
     * @param {THREE.Vector3} [centerPos]
     */
    activate(centerPos = null) {
        this.isActive = true;
        if (centerPos) {
            this.origin.copy(centerPos);
        }
        console.log('[TribalFX] Efeitos de Fogo e Fumaça Tribal ativados!');
    }

    /**
     * Desativa e esvazia os efeitos visuais.
     */
    deactivate() {
        this.isActive = false;
        this.intensity = 0.0;
        this.campfireLight.intensity = 0.0;
        this.fireMat.opacity = 0.0;
        this.smokeMat.opacity = 0.0;
        this.sparkMat.opacity = 0.0;

        // Mover partículas para fora do campo de visão
        for (let i = 0; i < this.fireCount; i++) {
            this.firePos[i * 3 + 1] = -100.0;
            this.fireData[i].life = 0;
        }
        for (let i = 0; i < this.smokeCount; i++) {
            this.smokePos[i * 3 + 1] = -100.0;
            this.smokeData[i].life = 0;
        }
        for (let i = 0; i < this.sparkCount; i++) {
            this.sparkPos[i * 3 + 1] = -100.0;
            this.sparkData[i].life = 0;
        }

        this.fireGeo.attributes.position.needsUpdate = true;
        this.smokeGeo.attributes.position.needsUpdate = true;
        this.sparkGeo.attributes.position.needsUpdate = true;
    }

    /**
     * Atualiza as partículas e a iluminação da fogueira a cada frame.
     * @param {number} dt Delta time em segundos
     * @param {number} elapsedTime Tempo total decorrido
     * @param {THREE.Vector3} hxPosition Posição central do HexaBOT
     * @param {Function} getTerrainHeightFn Função de altitude do terreno
     */
    update(dt, elapsedTime, hxPosition, getTerrainHeightFn) {
        if (!this.isActive && this.intensity <= 0.001) {
            return;
        }

        if (hxPosition) {
            this.origin.copy(hxPosition);
        }

        // Transição suave de intensidade
        const targetIntensity = this.isActive ? 1.0 : 0.0;
        this.intensity = THREE.MathUtils.damp(this.intensity, targetIntensity, 3.5, dt);

        const groundY = getTerrainHeightFn(this.origin.x, this.origin.z);

        // --- 1. LUZ DA FOGUEIRA COM FLICKER REALISTA ---
        if (this.intensity > 0.01) {
            const flicker1 = Math.sin(elapsedTime * 28.0) * 0.45;
            const flicker2 = Math.cos(elapsedTime * 47.0) * 0.35;
            const flicker3 = Math.sin(elapsedTime * 73.0) * 0.20;
            const flameNoise = (flicker1 + flicker2 + flicker3);

            const lightIntensity = (22.0 + flameNoise * 8.0) * this.intensity;
            this.campfireLight.position.set(this.origin.x, groundY + 0.85, this.origin.z);
            this.campfireLight.intensity = lightIntensity;

            // Variação orgânica entre âmbar quente e laranja fogo
            const hue = 0.07 + flameNoise * 0.015;
            this.campfireLight.color.setHSL(hue, 1.0, 0.52);
        } else {
            this.campfireLight.intensity = 0.0;
        }

        // --- 2. FOGO E BRASAS INCANDESCENTES (Additive) ---
        this.fireMat.opacity = this.intensity * 0.95;
        for (let i = 0; i < this.fireCount; i++) {
            const p = this.fireData[i];
            p.life -= dt;

            if (p.life <= 0 && this.isActive) {
                // Renascer partícula de fogo na base do chassi
                p.maxLife = 0.7 + Math.random() * 0.9;
                p.life = p.maxLife;

                const angle = Math.random() * Math.PI * 2;
                const r = Math.random() * p.swirlRadius;
                p.x = this.origin.x + Math.sin(angle) * r;
                p.z = this.origin.z + Math.cos(angle) * r;
                p.y = groundY + 0.15 + Math.random() * 0.3;

                p.vx = (Math.random() - 0.5) * 0.6;
                p.vy = 2.0 + Math.random() * 2.8;
                p.vz = (Math.random() - 0.5) * 0.6;
            }

            if (p.life > 0) {
                const progress = 1.0 - (p.life / p.maxLife); // 0 (nascimento) a 1 (morte)

                // Movimento ascendente e turbulência espiral
                p.swirlOffset += dt * 4.0;
                p.x += (p.vx + Math.sin(p.swirlOffset) * 0.25) * dt;
                p.y += p.vy * dt;
                p.z += (p.vz + Math.cos(p.swirlOffset) * 0.25) * dt;

                this.firePos[i * 3] = p.x;
                this.firePos[i * 3 + 1] = p.y;
                this.firePos[i * 3 + 2] = p.z;

                // Gradiente de cor: Branco Amarelado -> Laranja Intenso -> Vermelho Brasa Escuro
                const rCol = 1.0;
                const gCol = Math.max(0.0, 1.0 - progress * 1.3);
                const bCol = Math.max(0.0, 0.4 - progress * 1.8);

                this.fireCol[i * 3] = rCol;
                this.fireCol[i * 3 + 1] = gCol;
                this.fireCol[i * 3 + 2] = bCol;

                // Tamanho diminui conforme sobe
                this.fireSizes[i] = p.baseSize * (1.0 - progress * 0.75);
            } else {
                this.firePos[i * 3 + 1] = -100.0;
            }
        }
        this.fireGeo.attributes.position.needsUpdate = true;
        this.fireGeo.attributes.color.needsUpdate = true;

        // --- 3. FUMAÇA TRIBAL ONDULANTE (Normal Blending) ---
        this.smokeMat.opacity = this.intensity * 0.45;
        for (let i = 0; i < this.smokeCount; i++) {
            const s = this.smokeData[i];
            s.life -= dt;

            if (s.life <= 0 && this.isActive) {
                s.maxLife = 2.4 + Math.random() * 1.8;
                s.life = s.maxLife;

                const angle = Math.random() * Math.PI * 2;
                const r = Math.random() * 1.4;
                s.x = this.origin.x + Math.sin(angle) * r;
                s.z = this.origin.z + Math.cos(angle) * r;
                s.y = groundY + 0.6 + Math.random() * 0.4;

                s.vx = (Math.random() - 0.5) * 0.8 + 0.3; // leve brisa na arena
                s.vy = 1.2 + Math.random() * 1.6;
                s.vz = (Math.random() - 0.5) * 0.8;
            }

            if (s.life > 0) {
                const progress = 1.0 - (s.life / s.maxLife);

                s.x += s.vx * dt;
                s.y += s.vy * dt;
                s.z += s.vz * dt;

                this.smokePos[i * 3] = s.x;
                this.smokePos[i * 3 + 1] = s.y;
                this.smokePos[i * 3 + 2] = s.z;

                // Fumaça cinza-chumbo com matiz de fuligem quente
                const alphaFade = Math.sin(progress * Math.PI);
                const colVal = 0.45 * alphaFade;
                this.smokeCol[i * 3] = colVal * 1.1;
                this.smokeCol[i * 3 + 1] = colVal * 0.85;
                this.smokeCol[i * 3 + 2] = colVal * 0.7;

                this.smokeSizes[i] = THREE.MathUtils.lerp(s.startSize, s.endSize, progress);
            } else {
                this.smokePos[i * 3 + 1] = -100.0;
            }
        }
        this.smokeGeo.attributes.position.needsUpdate = true;
        this.smokeGeo.attributes.color.needsUpdate = true;

        // --- 4. FAÍSCAS NO RASTRO DO CÍRCULO TRIBAL (8.2m) ---
        this.sparkMat.opacity = this.intensity * 0.90;
        for (let i = 0; i < this.sparkCount; i++) {
            const sp = this.sparkData[i];
            sp.life -= dt;

            if (sp.life <= 0 && this.isActive) {
                sp.maxLife = 0.5 + Math.random() * 0.7;
                sp.life = sp.maxLife;

                sp.angle = Math.random() * Math.PI * 2;
                const ringRadius = 8.2 + (Math.random() - 0.5) * 0.8;

                sp.x = this.origin.x + Math.sin(sp.angle) * ringRadius;
                sp.z = this.origin.z + Math.cos(sp.angle) * ringRadius;
                sp.y = getTerrainHeightFn(sp.x, sp.z) + 0.15;

                sp.vx = (Math.random() - 0.5) * 1.5;
                sp.vy = 1.0 + Math.random() * 2.2;
                sp.vz = (Math.random() - 0.5) * 1.5;
            }

            if (sp.life > 0) {
                const progress = 1.0 - (sp.life / sp.maxLife);

                sp.x += sp.vx * dt;
                sp.y += sp.vy * dt;
                sp.z += sp.vz * dt;

                this.sparkPos[i * 3] = sp.x;
                this.sparkPos[i * 3 + 1] = sp.y;
                this.sparkPos[i * 3 + 2] = sp.z;

                this.sparkCol[i * 3] = 1.0;
                this.sparkCol[i * 3 + 1] = 0.7 * (1.0 - progress);
                this.sparkCol[i * 3 + 2] = 0.1 * (1.0 - progress);

                this.sparkSizes[i] = sp.baseSize * (1.0 - progress * 0.8);
            } else {
                this.sparkPos[i * 3 + 1] = -100.0;
            }
        }
        this.sparkGeo.attributes.position.needsUpdate = true;
        this.sparkGeo.attributes.color.needsUpdate = true;
    }

    /**
     * Libera recursos de memória Three.js.
     */
    dispose() {
        this.deactivate();
        if (this.campfireLight && this.campfireLight.parent) {
            this.campfireLight.parent.remove(this.campfireLight);
        }
        if (this.firePoints && this.firePoints.parent) {
            this.firePoints.parent.remove(this.firePoints);
        }
        if (this.smokePoints && this.smokePoints.parent) {
            this.smokePoints.parent.remove(this.smokePoints);
        }
        if (this.sparkPoints && this.sparkPoints.parent) {
            this.sparkPoints.parent.remove(this.sparkPoints);
        }

        this.fireGeo.dispose();
        this.fireMat.dispose();
        this.smokeGeo.dispose();
        this.smokeMat.dispose();
        this.sparkGeo.dispose();
        this.sparkMat.dispose();
    }
}
