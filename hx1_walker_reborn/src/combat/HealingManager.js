/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — HEALINGMANAGER.JS
 * Gerenciador da Esfera de Regeneração / Healing (+500 HP)
 * ============================================================================
 * - Spawna aleatoriamente no topo dos cilindros/tambores de colisão da arena.
 * - Esfera de plasma vermelho/rubi pulsante com anéis giroscópicos e sinalizador vertical.
 * - Detecção analítica de hover com o cursor do mouse e coleta com <kbd>Espaço</kbd>.
 * - Restaura +500 HP de integridade estrutural ao HexaBOT (limitado ao HP máximo 1000).
 * - Feixe elétrico de absorção, explosão de brasas rubras e respawn contínuo.
 * - Geometrias e materiais pré-alocados para Zero Garbage Collection (Zero Stutter).
 */

import * as THREE from 'three';

export class HealingManager {
    /**
     * @param {THREE.Scene} scene Cena principal Three.js
     * @param {import('../core/EventBus.js').EventBus} eventBus Barramento de eventos
     * @param {import('../world/TerrainArena.js').TerrainArena} terrainArena Instância da arena
     */
    constructor(scene, eventBus, terrainArena) {
        this.scene = scene;
        this.eventBus = eventBus;
        this.terrainArena = terrainArena;

        // Estado do Healing
        this.isActive = false;
        this.isHovered = false;
        this.currentPosition = new THREE.Vector3();
        this.baseY = 0.0;
        this.currentPillarIndex = -1;
        this.respawnTimer = 1.0; // Primeiro spawn logo aos 1.0s de jogo
        this.lifespanTimer = 14.0; // Se não for coletada em 14s, teletransporta para outro cilindro
        this.RESPAWN_DELAY_MIN = 3.0; // 3 a 6 segundos após a coleta
        this.RESPAWN_DELAY_MAX = 6.0;

        // Efeito de Absorção / Transferência de Energia
        this.isAbsorbing = false;
        this.absorptionTimer = 0.0;
        this.absorptionOrigin = new THREE.Vector3();
        this.absorptionTarget = new THREE.Vector3();

        // Construir malhas 3D e efeitos visuais
        this.buildOrbMeshes();
        this.buildAbsorptionBeam();
        this.buildBurstParticles();

        // Registrar ouvintes de eventos
        this.bindEvents();
    }

    /**
     * Cria os objetos gráficos da esfera de plasma vermelho e seus anéis orbitais.
     */
    buildOrbMeshes() {
        this.orbGroup = new THREE.Group();
        this.orbGroup.position.set(0, -9999, 0); // Inicia fora da visão para pré-compilação na GPU sem stutter
        this.orbGroup.visible = true;
        this.scene.add(this.orbGroup);

        // 1. Núcleo Incandescente Branco/Rubi (Inner Core)
        const coreGeo = new THREE.SphereGeometry(1.2, 24, 24);
        this.coreMat = new THREE.MeshBasicMaterial({
            color: 0xfff0f5,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending
        });
        this.coreMesh = new THREE.Mesh(coreGeo, this.coreMat);
        this.orbGroup.add(this.coreMesh);

        // 2. Casca de Plasma Carmesim Pulsante (Outer Shield)
        const plasmaGeo = new THREE.SphereGeometry(1.75, 24, 24);
        this.plasmaMat = new THREE.MeshBasicMaterial({
            color: 0xff0044,
            transparent: true,
            opacity: 0.80,
            blending: THREE.AdditiveBlending,
            wireframe: true
        });
        this.plasmaMesh = new THREE.Mesh(plasmaGeo, this.plasmaMat);
        this.orbGroup.add(this.plasmaMesh);

        // 3. Anéis Giroscópicos Orbitais de Cura
        const ringGeo1 = new THREE.TorusGeometry(2.2, 0.09, 12, 36);
        const ringGeo2 = new THREE.TorusGeometry(2.6, 0.09, 12, 36);
        const ringGeo3 = new THREE.TorusGeometry(3.0, 0.09, 12, 36);

        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff2255,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending
        });

        this.ring1 = new THREE.Mesh(ringGeo1, ringMat);
        this.ring2 = new THREE.Mesh(ringGeo2, ringMat);
        this.ring3 = new THREE.Mesh(ringGeo3, ringMat);

        this.ring1.rotation.x = Math.PI * 0.35;
        this.ring2.rotation.y = Math.PI * 0.45;
        this.ring3.rotation.z = Math.PI * 0.65;

        this.orbGroup.add(this.ring1);
        this.orbGroup.add(this.ring2);
        this.orbGroup.add(this.ring3);

        // 4. Sinalizador Gigante Vertical de Luz até o Domo (Sky Beacon Beam Vermelho)
        const beaconGeo = new THREE.CylinderGeometry(1.6, 4.0, 140.0, 16, 1, true);
        beaconGeo.translate(0, 70.0, 0); // Base em 0, topo em 140m
        this.beaconMat = new THREE.MeshBasicMaterial({
            color: 0xff0033,
            transparent: true,
            opacity: 0.35,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        this.beaconMesh = new THREE.Mesh(beaconGeo, this.beaconMat);
        this.orbGroup.add(this.beaconMesh);

        // 5. Nuvem de Partículas / Faíscas Orbitantes em Torno da Esfera
        this.sparkCount = 36;
        const sparkGeo = new THREE.BufferGeometry();
        const sparkPositions = new Float32Array(this.sparkCount * 3);
        const sparkSizes = new Float32Array(this.sparkCount);

        for (let i = 0; i < this.sparkCount; i++) {
            const u = Math.random();
            const v = Math.random();
            const theta = u * 2.0 * Math.PI;
            const phi = Math.acos(2.0 * v - 1.0);
            const r = 2.0 + Math.random() * 0.8;

            sparkPositions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
            sparkPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            sparkPositions[i * 3 + 2] = r * Math.cos(phi);
            sparkSizes[i] = 0.35 + Math.random() * 0.45;
        }

        sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
        sparkGeo.setAttribute('size', new THREE.BufferAttribute(sparkSizes, 1));

        this.sparkMat = new THREE.PointsMaterial({
            color: 0xff2266,
            size: 0.55,
            transparent: true,
            opacity: 0.90,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.sparkCloud = new THREE.Points(sparkGeo, this.sparkMat);
        this.orbGroup.add(this.sparkCloud);

        // 6. Luz Pontual Vermelha Pulsante no Topo do Cilindro
        this.pointLight = new THREE.PointLight(0xff0044, 0.0, 32.0, 0.85);
        this.orbGroup.add(this.pointLight);
    }

    /**
     * Constrói a linha de raio elétrico para o efeito de absorção instantânea de cura.
     */
    buildAbsorptionBeam() {
        const segCount = 18;
        this.beamPoints = [];
        for (let i = 0; i <= segCount; i++) {
            this.beamPoints.push(new THREE.Vector3());
        }
        this.beamGeo = new THREE.BufferGeometry().setFromPoints(this.beamPoints);
        this.beamMat = new THREE.LineBasicMaterial({
            color: 0xff2266,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            linewidth: 3
        });
        this.beamLine = new THREE.Line(this.beamGeo, this.beamMat);
        this.beamLine.frustumCulled = false;
        this.scene.add(this.beamLine);
    }

    /**
     * Constrói o sistema de partículas para a explosão de coleta de cura.
     */
    buildBurstParticles() {
        this.burstCount = 60;
        this.burstData = [];
        this.burstPositions = new Float32Array(this.burstCount * 3);
        this.burstColors = new Float32Array(this.burstCount * 3);

        for (let i = 0; i < this.burstCount; i++) {
            this.burstPositions[i * 3 + 1] = -999.0;
            this.burstColors[i * 3 + 0] = 1.0;
            this.burstColors[i * 3 + 1] = 0.15;
            this.burstColors[i * 3 + 2] = 0.35;

            this.burstData.push({
                active: false,
                pos: new THREE.Vector3(),
                vel: new THREE.Vector3(),
                life: 0.0,
                maxLife: 1.0
            });
        }

        this.burstGeo = new THREE.BufferGeometry();
        this.burstGeo.setAttribute('position', new THREE.BufferAttribute(this.burstPositions, 3));
        this.burstGeo.setAttribute('color', new THREE.BufferAttribute(this.burstColors, 3));

        this.burstMat = new THREE.PointsMaterial({
            size: 0.85,
            vertexColors: true,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.burstPoints = new THREE.Points(this.burstGeo, this.burstMat);
        this.burstPoints.frustumCulled = false;
        this.scene.add(this.burstPoints);
    }

    /**
     * Vincula ouvintes de eventos para coleta com a tecla Espaço e reset.
     */
    bindEvents() {
        // Coleta de Healing ao pressionar Espaço com o cursor mirado na orbe
        this.eventBus.on('combat:toggleLock', () => {
            if (this.isActive && this.isHovered) {
                this.collect();
            }
        });

        // Reset da partida (<kbd>R</kbd>)
        this.eventBus.on('bot:resetPosition', () => {
            this.reset();
        });

        // Avanço de fase após vitória ("Continuar Missão")
        this.eventBus.on('combat:continue', () => {
            this.reset();
        });

        // Início de missão / Primeira partida
        this.eventBus.on('game:start', () => {
            this.reset();
        });

        // Ocultar e pausar orbe durante a comemoração da vitória
        this.eventBus.on('combat:victory', () => {
            this.isActive = false;
            this.orbGroup.position.set(0, -9999, 0);
            this.pointLight.intensity = 0.0;
        });
    }

    /**
     * Spawna a esfera de cura em um cilindro/tambor aleatório da arena.
     */
    spawnRandom() {
        const pillarPositions = this.terrainArena.getPillarTopPositions();
        if (!pillarPositions || pillarPositions.length === 0) return;

        // Escolher um cilindro aleatório diferente do anterior
        let nextIdx = Math.floor(Math.random() * pillarPositions.length);
        if (pillarPositions.length > 1 && nextIdx === this.currentPillarIndex) {
            nextIdx = (nextIdx + 1) % pillarPositions.length;
        }
        this.currentPillarIndex = nextIdx;

        const targetPos = pillarPositions[nextIdx];
        this.currentPosition.copy(targetPos);
        this.baseY = targetPos.y + 2.5; // Flutua 2.5m acima do topo do tambor

        this.orbGroup.position.set(this.currentPosition.x, this.baseY, this.currentPosition.z);
        this.orbGroup.visible = true;
        this.isActive = true;
        this.isHovered = false;
        this.lifespanTimer = 14.0; // Permanece 14s neste cilindro antes de rotacionar se não for coletada

        // Notificação tática no HUD
        this.eventBus.emit('ui:tacticalAlert', {
            text: '❤️ CÉLULA DE REGENERAÇÃO DETECTADA NOS TAMBORES!',
            color: '#ff2255',
            duration: 3.5
        });
    }

    /**
     * Rotaciona a esfera para outro cilindro quando não é coletada a tempo.
     */
    relocate() {
        this.isActive = false;
        this.orbGroup.position.set(0, -9999, 0);
        this.pointLight.intensity = 0.0;
        this.respawnTimer = 1.0; // 1 segundo para reaparecer em outro cilindro
    }

    /**
     * Dispara a coleta do healing pelo robô.
     * @param {THREE.Vector3} [botPos]
     */
    collect(botPos = null) {
        if (!this.isActive) return;

        // Posição de origem da coleta antes de mover para standby
        this.absorptionOrigin.copy(this.orbGroup.position);

        this.isActive = false;
        this.orbGroup.position.set(0, -9999, 0);
        this.pointLight.intensity = 0.0;
        this.respawnTimer = THREE.MathUtils.randFloat(this.RESPAWN_DELAY_MIN, this.RESPAWN_DELAY_MAX);

        // Disparar evento de restauração de +500 HP
        this.eventBus.emit('combat:healingCollected', {
            amount: 500.0,
            origin: this.absorptionOrigin
        });

        // Iniciar feixe elétrico de absorção
        this.isAbsorbing = true;
        this.absorptionTimer = 0.50; // 500ms de arco elétrico
        if (botPos) this.absorptionTarget.copy(botPos).add(new THREE.Vector3(0, 1.5, 0));

        // Disparar explosão de partículas rubras
        this.triggerBurst(this.absorptionOrigin);

        // Notificação no HUD
        this.eventBus.emit('ui:tacticalAlert', {
            text: '❤️ REGENERAÇÃO COLETADA: +500 HP!',
            color: '#ff2255',
            duration: 3.5
        });
    }

    /**
     * Dispara a explosão de faíscas na posição da coleta.
     * @param {THREE.Vector3} pos
     */
    triggerBurst(pos) {
        for (let i = 0; i < this.burstCount; i++) {
            const b = this.burstData[i];
            b.active = true;
            b.life = 0.0;
            b.maxLife = THREE.MathUtils.randFloat(0.40, 0.90);
            b.pos.copy(pos);

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const spd = THREE.MathUtils.randFloat(7.0, 18.0);
            b.vel.set(
                Math.sin(phi) * Math.cos(theta) * spd,
                Math.cos(phi) * spd + 4.0,
                Math.sin(phi) * Math.sin(theta) * spd
            );
        }
        this.burstMat.opacity = 1.0;
    }

    /**
     * Reseta a esfera de cura para um novo ciclo de spawn.
     */
    reset() {
        this.isActive = false;
        this.isHovered = false;
        this.currentPillarIndex = -1;
        this.orbGroup.position.set(0, -9999, 0);
        this.orbGroup.visible = true;
        this.pointLight.intensity = 0.0;
        this.isAbsorbing = false;
        this.beamMat.opacity = 0.0;
        this.burstMat.opacity = 0.0;
        this.respawnTimer = 1.0; // Spawna logo após 1.0s ao reiniciar ou avançar fase
        for (let i = 0; i < this.burstCount; i++) {
            this.burstData[i].active = false;
            this.burstPositions[i * 3 + 1] = -999.0;
        }
        if (this.burstGeo && this.burstGeo.attributes.position) {
            this.burstGeo.attributes.position.needsUpdate = true;
        }
    }

    /**
     * Executa o loop de atualização da esfera, rotações, hover, absorção e partículas.
     * @param {number} dt Delta time em segundos
     * @param {number} elapsedTime Tempo total decorrido
     * @param {THREE.Vector3} botPosition Posição atual do mecha
     * @param {THREE.Raycaster} raycaster Raycaster da mira do mouse
     */
    update(dt, elapsedTime, botPosition, raycaster) {
        // 1. Controle de Respawn Contínuo e Relocação
        if (!this.isActive) {
            this.respawnTimer -= dt;
            if (this.respawnTimer <= 0.0) {
                this.spawnRandom();
            }
        } else {
            // Se a orbe não for coletada em 14s, rotaciona automaticamente para outro tambor
            this.lifespanTimer -= dt;
            if (this.lifespanTimer <= 0.0) {
                this.relocate();
            }
        }

        // 2. Animação da Esfera Ativa
        if (this.isActive) {
            // Levitação suave no ar
            const levitation = Math.sin(elapsedTime * 3.8 + 1.5) * 0.40;
            this.orbGroup.position.y = this.baseY + levitation;

            // Rotação dos Anéis Giroscópicos
            const speedMult = this.isHovered ? 2.5 : 1.0;
            this.ring1.rotation.x += dt * 2.4 * speedMult;
            this.ring2.rotation.y += dt * 2.9 * speedMult;
            this.ring3.rotation.z += dt * 2.0 * speedMult;

            // Pulso e Cintilação do Núcleo e Casca Carmesim
            const pulse = Math.sin(elapsedTime * 8.5) * 0.16 + Math.cos(elapsedTime * 20.0) * 0.08;
            const hoverScale = this.isHovered ? 1.25 : 1.0;
            const coreScale = (1.0 + pulse) * hoverScale;
            this.coreMesh.scale.set(coreScale, coreScale, coreScale);
            this.plasmaMesh.scale.set(1.0 + pulse * 0.7, 1.0 + pulse * 0.7, 1.0 + pulse * 0.7);

            // Rotação da Nuvem de Partículas
            this.sparkCloud.rotation.y += dt * 1.5;
            this.sparkCloud.rotation.x += dt * 0.8;

            // Sinalizador de Feixe Vertical (Pulsando)
            const beaconOpacity = (this.isHovered ? 0.50 : 0.30) + Math.sin(elapsedTime * 5.5) * 0.10;
            this.beaconMat.opacity = THREE.MathUtils.clamp(beaconOpacity, 0.12, 0.80);

            // Luz Pontual
            const lightIntensity = (this.isHovered ? 38.0 : 20.0) + pulse * 8.0;
            this.pointLight.intensity = lightIntensity;

            // Teste Analítico Ultrarrápido de Hover com o Cursor (0ms, sem traversals de malha)
            if (raycaster && raycaster.ray) {
                const distToRay = raycaster.ray.distanceToPoint(this.orbGroup.position);
                const toOrbX = this.orbGroup.position.x - raycaster.ray.origin.x;
                const toOrbY = this.orbGroup.position.y - raycaster.ray.origin.y;
                const toOrbZ = this.orbGroup.position.z - raycaster.ray.origin.z;
                const isAhead = (toOrbX * raycaster.ray.direction.x + toOrbY * raycaster.ray.direction.y + toOrbZ * raycaster.ray.direction.z) > 0;
                this.isHovered = isAhead && (distToRay < 5.2);
            } else {
                this.isHovered = false;
            }
        }

        // 3. Efeito de Feixe Elétrico Fractal de Absorção
        if (this.isAbsorbing && botPosition) {
            this.absorptionTimer -= dt;
            if (this.absorptionTimer <= 0.0) {
                this.isAbsorbing = false;
                this.beamMat.opacity = 0.0;
            } else {
                this.beamMat.opacity = this.absorptionTimer / 0.50;
                const target = this.absorptionTarget.copy(botPosition).add(new THREE.Vector3(0, 1.5, 0));
                const segs = this.beamPoints.length - 1;

                for (let i = 0; i <= segs; i++) {
                    const t = i / segs;
                    this.beamPoints[i].lerpVectors(this.absorptionOrigin, target, t);
                    if (i > 0 && i < segs) {
                        const jitter = Math.sin(i * 4.3 + elapsedTime * 45.0) * 0.95;
                        this.beamPoints[i].x += jitter * (1.0 - Math.abs(t - 0.5) * 2.0);
                        this.beamPoints[i].y += Math.cos(i * 3.1 + elapsedTime * 40.0) * 0.95 * (1.0 - Math.abs(t - 0.5) * 2.0);
                        this.beamPoints[i].z += Math.sin(i * 5.2 + elapsedTime * 35.0) * 0.95 * (1.0 - Math.abs(t - 0.5) * 2.0);
                    }
                }
                this.beamGeo.setFromPoints(this.beamPoints);
            }
        }

        // 4. Atualização das Partículas de Explosão da Coleta
        let anyActive = false;
        const posAttr = this.burstGeo.attributes.position;
        const colAttr = this.burstGeo.attributes.color;

        for (let i = 0; i < this.burstCount; i++) {
            const b = this.burstData[i];
            if (!b.active) continue;

            anyActive = true;
            b.life += dt;
            if (b.life >= b.maxLife) {
                b.active = false;
                posAttr.setY(i, -999.0);
                continue;
            }

            b.vel.y -= 16.0 * dt; // Gravidade
            b.vel.multiplyScalar(0.96); // Arrasto
            b.pos.addScaledVector(b.vel, dt);

            posAttr.setXYZ(i, b.pos.x, b.pos.y, b.pos.z);

            const progress = b.life / b.maxLife;
            colAttr.setXYZ(i, 1.0, (1.0 - progress) * 0.5, (1.0 - progress) * 0.7);
        }

        if (anyActive) {
            posAttr.needsUpdate = true;
            colAttr.needsUpdate = true;
        } else if (this.burstMat.opacity > 0.0) {
            this.burstMat.opacity = 0.0;
        }
    }
}
