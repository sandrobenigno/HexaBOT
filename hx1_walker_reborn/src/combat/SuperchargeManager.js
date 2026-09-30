/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — SUPERCHARGEMANAGER.JS
 * Gerenciador da Esfera de Plasma Supercharge (500% de Energia do Laser)
 * ============================================================================
 * - Spawna aleatoriamente no topo de torres e monólitos da arena perimétrica.
 * - Esfera de plasma azul piscante com anéis giroscópicos, corona de faíscas e feixe sinalizador vertical até o domo.
 * - Hover com o cursor do mouse e coleta com <kbd>Espaço</kbd>.
 * - Recarrega a energia do laser para 500% (gasta 400% antes de descer de 100% a 0%).
 * - Feixe de transferência de energia, explosão de absorção e temporizador de respawn.
 */

import * as THREE from 'three';

export class SuperchargeManager {
    /**
     * @param {THREE.Scene} scene Cena principal Three.js
     * @param {import('../core/EventBus.js').EventBus} eventBus Barramento de eventos
     * @param {import('../world/TerrainArena.js').TerrainArena} terrainArena Instância da arena
     */
    constructor(scene, eventBus, terrainArena) {
        this.scene = scene;
        this.eventBus = eventBus;
        this.terrainArena = terrainArena;

        // Estado do Supercharge
        this.isActive = false;
        this.isHovered = false;
        this.currentPosition = new THREE.Vector3();
        this.baseY = 0.0;
        this.currentTowerIndex = -1;
        this.respawnTimer = 1.0; // Primeiro spawn logo aos 1.0 segundos de jogo
        this.lifespanTimer = 14.0; // Se não for coletada em 14s, teletransporta para outra torre
        this.RESPAWN_DELAY_MIN = 3.0; // Apenas 3 a 5 segundos após a coleta
        this.RESPAWN_DELAY_MAX = 5.0;

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
     * Cria os objetos gráficos da esfera de plasma e seus anéis orbitais.
     */
    buildOrbMeshes() {
        this.orbGroup = new THREE.Group();
        this.orbGroup.position.set(0, -9999, 0); // Inicia fora da visão para pré-compilação na GPU sem stutter
        this.orbGroup.visible = true;
        this.scene.add(this.orbGroup);

        // 1. Núcleo Incandescente Branco/Ciano (Inner Core)
        const coreGeo = new THREE.SphereGeometry(1.3, 24, 24);
        this.coreMat = new THREE.MeshBasicMaterial({
            color: 0xf0fdff,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending
        });
        this.coreMesh = new THREE.Mesh(coreGeo, this.coreMat);
        this.orbGroup.add(this.coreMesh);

        // 2. Casca de Plasma Elétrico Pulsante (Outer Plasma Shield)
        const plasmaGeo = new THREE.SphereGeometry(1.85, 24, 24);
        this.plasmaMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending,
            wireframe: true
        });
        this.plasmaMesh = new THREE.Mesh(plasmaGeo, this.plasmaMat);
        this.orbGroup.add(this.plasmaMesh);

        // 3. Anéis Giroscópicos Orbitais de Energia
        const ringGeo1 = new THREE.TorusGeometry(2.4, 0.10, 12, 36);
        const ringGeo2 = new THREE.TorusGeometry(2.8, 0.10, 12, 36);
        const ringGeo3 = new THREE.TorusGeometry(3.2, 0.10, 12, 36);

        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending
        });

        this.ring1 = new THREE.Mesh(ringGeo1, ringMat);
        this.ring2 = new THREE.Mesh(ringGeo2, ringMat);
        this.ring3 = new THREE.Mesh(ringGeo3, ringMat);

        this.ring1.rotation.x = Math.PI * 0.3;
        this.ring2.rotation.y = Math.PI * 0.4;
        this.ring3.rotation.z = Math.PI * 0.6;

        this.orbGroup.add(this.ring1);
        this.orbGroup.add(this.ring2);
        this.orbGroup.add(this.ring3);

        // 4. Sinalizador Gigante Vertical de Luz até o Domo (Sky Beacon Beam)
        const beaconGeo = new THREE.CylinderGeometry(1.8, 4.5, 160.0, 16, 1, true);
        beaconGeo.translate(0, 80.0, 0); // Base em 0, topo em 160m
        this.beaconMat = new THREE.MeshBasicMaterial({
            color: 0x00e1ff,
            transparent: true,
            opacity: 0.40,
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
            const r = 2.2 + Math.random() * 0.8;

            sparkPositions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
            sparkPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            sparkPositions[i * 3 + 2] = r * Math.cos(phi);
            sparkSizes[i] = 0.35 + Math.random() * 0.45;
        }

        sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
        sparkGeo.setAttribute('size', new THREE.BufferAttribute(sparkSizes, 1));

        this.sparkMat = new THREE.PointsMaterial({
            color: 0x00f7ff,
            size: 0.60,
            transparent: true,
            opacity: 0.90,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.sparkCloud = new THREE.Points(sparkGeo, this.sparkMat);
        this.orbGroup.add(this.sparkCloud);

        // 6. Luz Pontual Pulsante no Topo da Torre
        this.pointLight = new THREE.PointLight(0x00f0ff, 0.0, 36.0, 0.85);
        this.orbGroup.add(this.pointLight);
    }

    /**
     * Constrói a linha de raio elétrico para o efeito de absorção instantânea.
     */
    buildAbsorptionBeam() {
        const segCount = 18;
        this.beamPoints = [];
        for (let i = 0; i <= segCount; i++) {
            this.beamPoints.push(new THREE.Vector3());
        }
        this.beamGeo = new THREE.BufferGeometry().setFromPoints(this.beamPoints);
        this.beamMat = new THREE.LineBasicMaterial({
            color: 0x00ffff,
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
     * Constrói o sistema de partículas para a explosão de coleta do supercharge.
     */
    buildBurstParticles() {
        this.burstCount = 60;
        this.burstData = [];
        this.burstPositions = new Float32Array(this.burstCount * 3);
        this.burstColors = new Float32Array(this.burstCount * 3);

        for (let i = 0; i < this.burstCount; i++) {
            this.burstPositions[i * 3 + 1] = -999.0;
            this.burstColors[i * 3 + 0] = 0.5;
            this.burstColors[i * 3 + 1] = 0.9;
            this.burstColors[i * 3 + 2] = 1.0;

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
        // Coleta de Supercharge ao pressionar Espaço com o cursor mirado na orbe
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
     * Spawna a esfera de plasma em uma torre aleatória da arena.
     */
    spawnRandom() {
        const towerPositions = this.terrainArena.getTowerTopPositions();
        if (!towerPositions || towerPositions.length === 0) return;

        // Escolher uma torre aleatória diferente da anterior
        let nextIdx = Math.floor(Math.random() * towerPositions.length);
        if (towerPositions.length > 1 && nextIdx === this.currentTowerIndex) {
            nextIdx = (nextIdx + 1) % towerPositions.length;
        }
        this.currentTowerIndex = nextIdx;

        const targetPos = towerPositions[nextIdx];
        this.currentPosition.copy(targetPos);
        this.baseY = targetPos.y + 3.0; // Flutua 3m acima do topo da torre

        this.orbGroup.position.set(this.currentPosition.x, this.baseY, this.currentPosition.z);
        this.orbGroup.visible = true;
        this.isActive = true;
        this.isHovered = false;
        this.lifespanTimer = 13.0; // Permanece 13s nesta torre antes de rotacionar se não for coletada

        // Notificação tática no HUD
        this.eventBus.emit('ui:tacticalAlert', {
            text: '⚡ SUPERCHARGE DETECTADO NO PERÍMETRO!',
            color: '#00f0ff',
            duration: 3.5
        });
    }

    /**
     * Rotaciona a esfera para outra torre quando não é coletada a tempo.
     */
    relocate() {
        this.isActive = false;
        this.orbGroup.position.set(0, -9999, 0);
        this.pointLight.intensity = 0.0;
        this.respawnTimer = 1.0; // 1 segundo para reaparecer em outra torre
    }

    /**
     * Dispara a coleta do supercharge pelo robô.
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

        // Disparar evento de absorção de 500% de energia
        this.eventBus.emit('combat:superchargeCollected', {
            energy: 500.0,
            origin: this.absorptionOrigin
        });

        // Iniciar feixe elétrico de absorção
        this.isAbsorbing = true;
        this.absorptionTimer = 0.50; // 500ms de arco elétrico
        if (botPos) this.absorptionTarget.copy(botPos).add(new THREE.Vector3(0, 1.5, 0));

        // Disparar explosão de partículas de plasma
        this.triggerBurst(this.absorptionOrigin);

        // Notificação no HUD
        this.eventBus.emit('ui:tacticalAlert', {
            text: '⚡ SUPERCHARGE ATIVADO: 500% DE ENERGIA!',
            color: '#00f0ff',
            duration: 4.0
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
            const speed = THREE.MathUtils.randFloat(8.0, 22.0);

            b.vel.set(
                Math.sin(phi) * Math.cos(theta) * speed,
                Math.sin(phi) * Math.sin(theta) * speed + 4.0,
                Math.cos(phi) * speed
            );
        }
        this.burstMat.opacity = 1.0;
    }

    /**
     * Reseta o estado da orbe.
     */
    reset() {
        this.isActive = false;
        this.isHovered = false;
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
            // Se a orbe não for coletada em 13s, rotaciona automaticamente para outra torre
            this.lifespanTimer -= dt;
            if (this.lifespanTimer <= 0.0) {
                this.relocate();
            }
        }

        // 2. Animação da Esfera Ativa
        if (this.isActive) {
            // Levitação suave no ar
            const levitation = Math.sin(elapsedTime * 3.5) * 0.45;
            this.orbGroup.position.y = this.baseY + levitation;

            // Rotação dos Anéis Giroscópicos
            const speedMult = this.isHovered ? 2.5 : 1.0;
            this.ring1.rotation.x += dt * 2.2 * speedMult;
            this.ring2.rotation.y += dt * 2.8 * speedMult;
            this.ring3.rotation.z += dt * 1.9 * speedMult;

            // Pulso e Cintilação do Núcleo e Casca de Plasma
            const pulse = Math.sin(elapsedTime * 9.0) * 0.15 + Math.cos(elapsedTime * 22.0) * 0.08;
            const hoverScale = this.isHovered ? 1.25 : 1.0;
            const coreScale = (1.0 + pulse) * hoverScale;
            this.coreMesh.scale.set(coreScale, coreScale, coreScale);
            this.plasmaMesh.scale.set(1.0 + pulse * 0.7, 1.0 + pulse * 0.7, 1.0 + pulse * 0.7);

            // Rotação da Nuvem de Partículas
            this.sparkCloud.rotation.y += dt * 1.6;
            this.sparkCloud.rotation.x += dt * 0.9;

            // Sinalizador de Feixe Vertical (Pulsando)
            const beaconOpacity = (this.isHovered ? 0.55 : 0.35) + Math.sin(elapsedTime * 6.0) * 0.10;
            this.beaconMat.opacity = THREE.MathUtils.clamp(beaconOpacity, 0.15, 0.85);

            // Luz Pontual
            const lightIntensity = (this.isHovered ? 42.0 : 22.0) + pulse * 8.0;
            this.pointLight.intensity = lightIntensity;

            // Teste Analítico Ultrarrápido de Hover com o Cursor (0ms, sem traversals de malha)
            if (raycaster && raycaster.ray) {
                const distToRay = raycaster.ray.distanceToPoint(this.orbGroup.position);
                const toOrbX = this.orbGroup.position.x - raycaster.ray.origin.x;
                const toOrbY = this.orbGroup.position.y - raycaster.ray.origin.y;
                const toOrbZ = this.orbGroup.position.z - raycaster.ray.origin.z;
                const isAhead = (toOrbX * raycaster.ray.direction.x + toOrbY * raycaster.ray.direction.y + toOrbZ * raycaster.ray.direction.z) > 0;
                this.isHovered = isAhead && (distToRay < 5.5);
            } else {
                this.isHovered = false;
            }
        }

        // 3. Atualização do Feixe Elétrico de Absorção
        if (this.isAbsorbing) {
            this.absorptionTimer -= dt;
            if (this.absorptionTimer <= 0.0) {
                this.isAbsorbing = false;
                this.beamMat.opacity = 0.0;
            } else {
                const progress = 1.0 - (this.absorptionTimer / 0.50);
                this.beamMat.opacity = (1.0 - progress) * 0.95;

                // Atualizar pontos do raio elétrico com ruído procedural de arco de plasma
                if (botPosition) {
                    this.absorptionTarget.copy(botPosition).add(new THREE.Vector3(0, 1.6, 0));
                }

                const segCount = this.beamPoints.length - 1;
                const posAttr = this.beamGeo.attributes.position;
                for (let i = 0; i <= segCount; i++) {
                    const t = i / segCount;
                    const jitter = (i === 0 || i === segCount) ? 0.0 : (Math.random() - 0.5) * 1.8;
                    const px = THREE.MathUtils.lerp(this.absorptionOrigin.x, this.absorptionTarget.x, t) + jitter;
                    const py = THREE.MathUtils.lerp(this.absorptionOrigin.y, this.absorptionTarget.y, t) + jitter * 0.8;
                    const pz = THREE.MathUtils.lerp(this.absorptionOrigin.z, this.absorptionTarget.z, t) + jitter;
                    posAttr.setXYZ(i, px, py, pz);
                }
                posAttr.needsUpdate = true;
            }
        }

        // 4. Atualização das Partículas de Explosão de Coleta
        let anyBurstActive = false;
        const burstPosAttr = this.burstGeo.attributes.position;
        for (let i = 0; i < this.burstCount; i++) {
            const b = this.burstData[i];
            if (b.active) {
                b.life += dt;
                if (b.life >= b.maxLife) {
                    b.active = false;
                    this.burstPositions[i * 3 + 1] = -999.0;
                } else {
                    anyBurstActive = true;
                    b.vel.y -= 18.0 * dt; // Gravidade
                    b.pos.addScaledVector(b.vel, dt);

                    this.burstPositions[i * 3 + 0] = b.pos.x;
                    this.burstPositions[i * 3 + 1] = b.pos.y;
                    this.burstPositions[i * 3 + 2] = b.pos.z;
                }
            }
        }
        if (anyBurstActive) {
            burstPosAttr.needsUpdate = true;
        }
    }
}
