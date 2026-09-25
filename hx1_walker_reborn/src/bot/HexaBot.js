/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — HEXABOT.JS
 * Controlador Mestre do Robô Hexápode Biomecânico
 * ============================================================================
 * Centraliza a integridade estrutural, rigging, dinâmicas reativas e subsistemas:
 * 1. Auto-Scanner de Hierarquia 3D (detecção de nós D0/E0, sockets, J1, J2, J3).
 * 2. Mira em Dois Níveis (Dual-Tier Aiming):
 *    - <= 25°: Torção de tronco pura (torsoYaw) mantendo patas no chão.
 *    - > 25°: Passadas de pivô no próprio eixo com cadência dinâmica.
 * 3. Dinâmica Reativa de Proximidade (Elevação e Recuo Logarítmico).
 * 4. Equilíbrio e Inclinação de Relevo (Terrain Pitch & Roll a partir dos apoios).
 * 5. Reação Física a Dano (Onda de choque com mola amortecida / Damped Spring).
 * 6. Integração com TripodGait, AutoSway, IKSolver, LaserCombat e ShapeKeyAnimator.
 */

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

import { Leg, CANONICAL_BASE_FOOTPRINTS } from '../kinematics/Leg.js';
import { IKSolver } from '../kinematics/IKSolver.js';
import { TripodGait } from '../kinematics/TripodGait.js';
import { AutoSway } from './AutoSway.js';
import { BotManifest } from './BotManifest.js';
import { ShapeKeyAnimator } from '../combat/ShapeKeyAnimator.js';
import { LaserCombat } from '../combat/LaserCombat.js';

export class HexaBot {
    /**
     * @param {THREE.Scene} scene Cena principal Three.js
     * @param {import('../core/EventBus.js').EventBus} eventBus Barramento de eventos
     */
    constructor(scene, eventBus) {
        this.scene = scene;
        this.eventBus = eventBus;

        // Grupos Hierárquicos Three.js
        this.robotMasterGroup = new THREE.Group();
        this.scene.add(this.robotMasterGroup);

        this.bodyGroup = new THREE.Group();
        this.robotMasterGroup.add(this.bodyGroup);

        this.footTargetGroup = new THREE.Group();
        this.footTargetGroup.visible = false; // Inicia âncoras ocultas por padrão
        this.scene.add(this.footTargetGroup);

        this.skeletonLinesGroup = new THREE.Group();
        this.scene.add(this.skeletonLinesGroup);
        this.skeletonLinesGroup.visible = false;

        // Integridade e Energia Tática do Mecha
        this.maxHp = 1000;
        this.hp = this.maxHp;
        this.maxEnergy = 100;
        this.energy = this.maxEnergy;
        this.isEnergyDepleted = false; // Trava de disparo até recarregar 100%

        // Luz Vermelha de Alerta de Dano sob o Chassi
        this.damageUnderLight = new THREE.PointLight(0xff0022, 0.0, 18.0, 1.0);
        this.damageUnderLight.position.set(0, 0.5, 0);
        this.scene.add(this.damageUnderLight);

        // Subsistemas
        this.gait = new TripodGait();
        this.sway = new AutoSway();
        this.shapeKeys = new ShapeKeyAnimator();
        this.combat = new LaserCombat(this.scene);

        // Estado do Modelo e Calibração
        this.modelRoot = null;
        this.legs = [];
        this.xrayMode = false;
        this.activeBotManifest = null;
        this.wasFiringLaser = false;

        // Reação a Dano
        this.damageReactionTimer = 0.0;
        this.DAMAGE_DURATION = 0.90; // 900ms de reação cômica

        // Coreografia e Estado de Morte da HX
        this.isDead = false;
        this.deathState = 'ALIVE'; // 'ALIVE', 'COLLAPSING', 'SPLAYING', 'PARALYZED'
        this.deathTimer = 0.0;
        this.deathStartBodyHeight = 1.70;
        this.deathJolt1Done = false;
        this.deathJolt2Done = false;
        this.deathJolt3Done = false;

        // Estado Cinemático & Postura
        this.walkerState = {
            // Posição no mundo
            posX: 0,
            posZ: 0,
            baseHeading: 0,     // Rumo da base/passadas (radianos)
            torsoYaw: 0,        // Rotação local do chassi/tronco
            travelHeading: 0,   // Direção real de deslocamento no mundo
            aimWorldPoint: new THREE.Vector3(0, 0, 18),
            aimWorldNormal: new THREE.Vector3(0, 1, 0),

            // Postura Original Calibrada
            stanceSpread: 1.10, // Abertura padrão 1.10x
            bodyHeight: 1.70,   // Altura padrão do corpo (1.70m)
            pivotSpeed: 15.0,   // Multiplicador da velocidade do pivô (padrão 15.0x)
            terrainRelief: 1.20, // Multiplicador de relevo do terreno

            // Controle de Marcha Tripé
            isMoving: false,
            isTurningInPlace: false,
            turnDir: 0,
            moveSpeed: 16.0,    // Velocidade de avanço (16.0 m/s padrão)
            stepTurnAngle: 16.0 * (Math.PI / 180.0), // 16 graus por passada de pivô
            stepHeight: 0.50,   // Altura do arco do passo (0.50m)
            strideLength: 2.00, // Alcance do passo (2.00m)

            // Dinâmica Reativa de Proximidade do Alvo
            dynPitch: 0,
            dynLift: 0,
            dynShiftZ: 0,

            // Equilíbrio do Terreno
            terrainElevationY: 0,
            terrainPitch: 0,
            terrainRoll: 0,

            // Câmera Tática Orbital (25° padrão)
            camAzimuth: Math.PI,
            camDistance: 50.0,
            camPitchDeg: 25.0,

            // Conforto de Mira (25 graus)
            comfortAngle: 25.0 * (Math.PI / 180.0)
        };

        // Rastreamento de Velocidade Angular para Áudio do Motor (motor.mp3)
        this.prevBaseHeading = 0;
        this.prevTorsoYaw = 0;
        this.prevDynPitch = 0;
        this.prevTerrainPitch = 0;
        this.prevTerrainRoll = 0;
        this.smoothedAngularSpeed = 0;

        // Trava de Mira (Lock-On) com Barra de Espaço
        this.lockedTarget = null;
        this.currentInputManager = null;
        this.buildLockCone();

        // Estado da Dança da Vitória (Ao Som de funk.mp3)
        this.isVictoryDancing = false;
        this.victoryDanceTime = 0.0;
        this.tempDanceTarget = new THREE.Vector3();

        // Registrar eventos do Barramento
        this.setupEventListeners();
    }

    /**
     * Registra ouvintes para controle de dano, reset e raio-x.
     */
    setupEventListeners() {
        this.eventBus.on('bot:triggerDamage', (damage) => this.triggerDamageReaction(damage));
        this.eventBus.on('bot:triggerDeath', () => this.triggerDeath());
        this.eventBus.on('bot:resetPosition', () => this.resetWalker());
        this.eventBus.on('bot:toggleXRay', () => this.toggleXRay());
        this.eventBus.on('combat:toggleLock', () => this.toggleTargetLock());
        this.eventBus.on('combat:victory', () => this.triggerVictoryDance());
        this.eventBus.on('combat:continue', () => this.stopVictoryDance());
        this.eventBus.on('camera:orbit', ({ deltaAzimuth, deltaPitchDeg }) => {
            this.walkerState.camAzimuth += deltaAzimuth;
            this.walkerState.camPitchDeg = THREE.MathUtils.clamp(
                this.walkerState.camPitchDeg + deltaPitchDeg,
                15.0,
                80.0
            );
        });
        this.eventBus.on('camera:zoom', (deltaDist) => {
            this.walkerState.camDistance = THREE.MathUtils.clamp(
                this.walkerState.camDistance + deltaDist,
                50.0,
                100.0
            );
        });
    }

    /**
     * Dispara o estado da Dança da Vitória (ao som de funk.mp3).
     */
    triggerVictoryDance() {
        if (this.isDead) return;
        this.isVictoryDancing = true;
        this.victoryDanceTime = 0.0;
        if (this.lockedTarget) {
            this.lockedTarget = null;
        }
        if (this.lockConeMesh) {
            this.lockConeMesh.visible = false;
        }
    }

    /**
     * Encerra a Dança da Vitória e devolve o controle do mecha ao jogador.
     */
    stopVictoryDance() {
        this.isVictoryDancing = false;
        this.victoryDanceTime = 0.0;
    }

    /**
     * Procura o próximo nó de junta óssea filho na hierarquia GLTF.
     * @param {THREE.Object3D} parent Nó pai
     * @returns {THREE.Object3D|null}
     */
    findNextJointNode(parent) {
        if (!parent || !parent.children || parent.children.length === 0) return null;
        // 1. Procurar nós filhos que não são mesh e não são helpers X-Ray
        const nonMesh = parent.children.find(c => !c.isMesh && c.name && !c.userData?.isXrayHelper);
        if (nonMesh) return nonMesh;
        // 2. Procurar nó que possui subfilhos
        const withChildren = parent.children.find(c => c.children && c.children.length > 0 && !c.userData?.isXrayHelper);
        if (withChildren) return withChildren;
        // 3. Fallback para primeiro filho válido
        return parent.children.find(c => !c.userData?.isXrayHelper) || parent.children[0] || null;
    }

    /**
     * Configura um novo modelo 3D carregado: varre os nós, calibra juntas e inicializa âncoras.
     * @param {THREE.Object3D} gltfScene Raiz da cena 3D
     * @param {string} modelId Identificador do modelo
     * @param {Object|null} explicitManifest Manifesto explícito ou extraído
     * @param {Function} [getTerrainHeightFn=null] Função para obter altitude do terreno
     */
    setupModel(gltfScene, modelId = '', explicitManifest = null, getTerrainHeightFn = null) {
        // Limpar pernas e geometrias anteriores
        while (this.bodyGroup.children.length > 0) this.bodyGroup.remove(this.bodyGroup.children[0]);
        while (this.footTargetGroup.children.length > 0) this.footTargetGroup.remove(this.footTargetGroup.children[0]);
        while (this.skeletonLinesGroup.children.length > 0) this.skeletonLinesGroup.remove(this.skeletonLinesGroup.children[0]);
        this.legs.length = 0;

        this.modelRoot = gltfScene;
        this.activeBotManifest = explicitManifest || BotManifest.extractBotManifest(null, gltfScene);

        // 1. Mapear Morph Targets
        this.shapeKeys.scanMorphTargets(this.modelRoot);

        // Configurar materiais e sombras do modelo
        this.modelRoot.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    child.material.envMapIntensity = 1.2;
                }
            }
        });

        // 2. Descobrir todos os Sockets de Pernas na Hierarquia
        const socketRegex = /^(D0|E0)[\_\-\(\s\d]|^Socket[\_\-\d]|^Hip[\_\-\d]|^LegSocket[\_\-\d]/i;
        const detectedSockets = [];

        this.modelRoot.traverse((child) => {
            if (child.name && socketRegex.test(child.name)) {
                detectedSockets.push(child);
            }
        });

        // Separar sockets em Direita (D) e Esquerda (E)
        const rightSockets = [];
        const leftSockets = [];

        detectedSockets.forEach((sock) => {
            const nameUpper = sock.name.toUpperCase();
            const isRight = nameUpper.startsWith('D') || nameUpper.includes('RIGHT') || nameUpper.includes('DIR') || sock.position.x < 0;
            if (isRight) {
                rightSockets.push(sock);
            } else {
                leftSockets.push(sock);
            }
        });

        // Ordenação determinística: Frente (+Z) -> Meio (~0) -> Trás (-Z)
        const getSocketIndex = (name) => {
            const mParen = name.match(/\((\d+)\)/);
            if (mParen) return parseInt(mParen[1], 10);
            const mEnd = name.match(/[\_\-\s](\d+)$/);
            if (mEnd) return parseInt(mEnd[1], 10);
            const mAny = name.match(/\d+/);
            return mAny ? parseInt(mAny[0], 10) : 999;
        };

        const sortLegsFrontToBack = (arr) => {
            return arr.sort((a, b) => {
                const idxA = getSocketIndex(a.name);
                const idxB = getSocketIndex(b.name);
                if (idxA !== 999 && idxB !== 999 && idxA !== idxB) {
                    return idxA - idxB;
                }
                return b.position.z - a.position.z;
            });
        };

        sortLegsFrontToBack(rightSockets);
        sortLegsFrontToBack(leftSockets);

        const sortedSockets = [...rightSockets, ...leftSockets];

        // Posicionar modelo no bodyGroup
        this.bodyGroup.position.set(0, 0, 0);
        this.bodyGroup.rotation.set(0, 0, 0);
        this.bodyGroup.add(this.modelRoot);
        this.bodyGroup.updateMatrixWorld(true);

        // 3. Medição Dinâmica de Juntas (L1, L2, L3) e Criação das Instâncias Leg
        let sumL1 = 0, sumL2 = 0, sumL3 = 0;
        let validLegCount = 0;
        const bodyWorldPos = new THREE.Vector3();
        this.bodyGroup.getWorldPosition(bodyWorldPos);

        sortedSockets.forEach((baseSocket, index) => {
            const isRight = index < rightSockets.length;
            const legSubIndex = isRight ? index : (index - rightSockets.length);
            const sideChar = isRight ? 'D' : 'E';

            // IDs canônicos: FR, MR, BR para Direita e FL, ML, BL para Esquerda
            const legId = isRight
                ? (['FR', 'MR', 'BR'][legSubIndex] || `DR_${legSubIndex}`)
                : (['FL', 'ML', 'BL'][legSubIndex] || `EL_${legSubIndex}`);

            // Tripod Group alternado em X (Grupo 0: FR, ML, BR | Grupo 1: FL, MR, BL)
            const tripodGroup = isRight
                ? (legSubIndex % 2 === 0 ? 0 : 1)
                : (legSubIndex % 2 === 0 ? 1 : 0);

            // Escala de mundo do socket
            const sVec = new THREE.Vector3();
            baseSocket.getWorldScale(sVec);
            const socketWorldScale = sVec.x || 1.0;

            // Nível 1: Coxa (J1)
            const j1Node = this.findNextJointNode(baseSocket);
            if (!j1Node) return;

            // Nível 2: Fêmur (J2)
            const j2Node = this.findNextJointNode(j1Node);
            if (!j2Node) return;

            // Nível 3: Tíbia (J3)
            const j3Node = this.findNextJointNode(j2Node);
            if (!j3Node) return;

            // Comprimentos medidos
            let l1Native = j2Node.position.length() * socketWorldScale;
            let l2Native = j3Node.position.length() * socketWorldScale;

            let maxX = 0;
            j3Node.traverse((c) => {
                if (c.isMesh && c.geometry) {
                    c.geometry.computeBoundingBox();
                    if (c.geometry.boundingBox) {
                        maxX = Math.max(maxX, c.geometry.boundingBox.max.x, Math.abs(c.geometry.boundingBox.min.x));
                    }
                }
            });
            let l3Native = (maxX > 0) ? (maxX * socketWorldScale) : (l2Native * 1.54);
            if (l3Native > 15.0) l3Native *= 0.01;
            if (l3Native < 0.2) l3Native = l2Native * 1.54;

            // Aplicar dados explícitos do manifesto se disponíveis
            if (this.activeBotManifest?.anatomy?.legs) {
                const manifestLeg = this.activeBotManifest.anatomy.legs.find(
                    ml => ml.socketName === baseSocket.name || ml.id === legId || ml.index === index
                );
                if (manifestLeg) {
                    if (manifestLeg.L1) l1Native = manifestLeg.L1;
                    if (manifestLeg.L2) l2Native = manifestLeg.L2;
                    if (manifestLeg.L3) l3Native = manifestLeg.L3;
                }
            }

            sumL1 += l1Native;
            sumL2 += l2Native;
            sumL3 += l3Native;
            validLegCount++;

            // Determinar baseOffset canônico
            const legReach = l1Native + l2Native + l3Native;
            const canonicalReach = 2.3608 + 2.1611 + 2.8000; // 7.3219m
            const legRatio = legReach / canonicalReach;

            let baseOffset;
            if (CANONICAL_BASE_FOOTPRINTS[legId]) {
                baseOffset = CANONICAL_BASE_FOOTPRINTS[legId].clone().multiplyScalar(legRatio);
            } else {
                const socketWorld = new THREE.Vector3();
                baseSocket.getWorldPosition(socketWorld);
                const relVec = new THREE.Vector3().subVectors(socketWorld, bodyWorldPos);
                const stanceReach = (l1Native * Math.cos(THREE.MathUtils.degToRad(35)) + 0.65 * (l2Native + l3Native));
                const dirH = new THREE.Vector2(relVec.x, relVec.z).normalize();
                baseOffset = new THREE.Vector3(relVec.x + dirH.x * stanceReach, 0.0, relVec.z + dirH.y * stanceReach);
            }

            if (this.activeBotManifest?.anatomy?.legs) {
                const manifestLeg = this.activeBotManifest.anatomy.legs.find(
                    ml => ml.socketName === baseSocket.name || ml.id === legId || ml.index === index
                );
                if (manifestLeg && Array.isArray(manifestLeg.defaultFootTarget)) {
                    baseOffset.set(
                        manifestLeg.defaultFootTarget[0],
                        manifestLeg.defaultFootTarget[1] || 0.0,
                        manifestLeg.defaultFootTarget[2]
                    );
                }
            }

            // Âncora Visual (Gizmo)
            const targetMesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.18, 16, 16),
                new THREE.MeshStandardMaterial({
                    color: isRight ? 0x00d2ff : 0x2ed573,
                    emissive: isRight ? 0x003366 : 0x115522,
                    roughness: 0.3
                })
            );
            targetMesh.castShadow = true;
            this.footTargetGroup.add(targetMesh);

            // Linha de Esqueleto Raio-X
            const lineGeo = new LineGeometry();
            lineGeo.setPositions([0,0,0, 0,0,0, 0,0,0, 0,0,0]);
            const lineMat = new LineMaterial({
                color: isRight ? 0x38bdf8 : 0x7bed9f,
                linewidth: 4.5,
                transparent: true,
                opacity: 0.95
            });
            lineMat.resolution.set(window.innerWidth, window.innerHeight);
            const lineMesh = new Line2(lineGeo, lineMat);
            this.skeletonLinesGroup.add(lineMesh);

            const legInstance = new Leg({
                id: legId,
                side: sideChar,
                group: tripodGroup,
                baseNode: baseSocket,
                j1Node,
                j2Node,
                j3Node,
                L1: l1Native,
                L2: l2Native,
                L3: l3Native,
                baseOffset,
                targetMesh,
                lineMesh
            });

            this.legs.push(legInstance);
        });

        // 4. Calibração Canônica Proporcional
        const avgL1 = validLegCount > 0 ? (sumL1 / validLegCount) : 2.3608;
        const avgL2 = validLegCount > 0 ? (sumL2 / validLegCount) : 2.1611;
        const avgL3 = validLegCount > 0 ? (sumL3 / validLegCount) : 2.8000;
        const totalReach = avgL1 + avgL2 + avgL3;
        const canonicalRatio = totalReach / 7.3219;

        this.walkerState.stanceSpread = this.activeBotManifest?.calibration?.stanceSpread ?? 1.10;
        this.walkerState.bodyHeight = this.activeBotManifest?.calibration?.defaultHeight ?? +(1.70 * canonicalRatio).toFixed(2);
        this.walkerState.strideLength = +(2.00 * canonicalRatio).toFixed(2);
        this.walkerState.stepHeight = +(0.50 * canonicalRatio).toFixed(2);

        this.bodyGroup.position.set(0, this.walkerState.bodyHeight, 0);
        this.bodyGroup.rotation.set(0, 0, 0);
        this.bodyGroup.updateMatrixWorld(true);

        this.updateAllLegNominalOffsets(getTerrainHeightFn);
        this.resetWalker(getTerrainHeightFn);

        // Notificar UI sobre novos valores calibrados
        this.eventBus.emit('bot:modelLoaded', {
            modelId,
            manifest: this.activeBotManifest,
            bodyHeight: this.walkerState.bodyHeight,
            stanceSpread: this.walkerState.stanceSpread,
            canonicalRatio
        });
    }

    /**
     * Atualiza os offsets nominais e âncoras de todas as pernas.
     * @param {Function} [getTerrainHeightFn=null]
     */
    updateAllLegNominalOffsets(getTerrainHeightFn = null) {
        this.bodyGroup.position.set(0, this.walkerState.bodyHeight, 0);

        this.legs.forEach((leg) => {
            leg.updateNominalOffset(this.walkerState.stanceSpread);

            if (!this.walkerState.isMoving && !this.walkerState.isTurningInPlace) {
                const nominalWorld = leg.nominalOffset.clone()
                    .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.walkerState.baseHeading)
                    .add(this.robotMasterGroup.position);

                if (getTerrainHeightFn) {
                    nominalWorld.y = getTerrainHeightFn(nominalWorld.x, nominalWorld.z);
                }
                leg.currentTarget.copy(nominalWorld);
                leg.stepStartTarget.copy(nominalWorld);
                leg.stepEndTarget.copy(nominalWorld);
                if (leg.targetMesh) leg.targetMesh.position.copy(nominalWorld);
            }
        });
    }

    /**
     * Inicia a sequência coreografada de colapso e morte da HX.
     */
    triggerDeath() {
        if (this.isDead) return;
        this.isDead = true;
        this.deathState = 'COLLAPSING';
        this.deathTimer = 0.0;
        this.deathStartBodyHeight = this.walkerState.bodyHeight;
        this.deathJolt1Done = false;
        this.deathJolt2Done = false;
        this.deathJolt3Done = false;
        this.hp = 0;

        // Parar locomoção e passadas
        this.walkerState.isMoving = false;
        this.walkerState.isTurningInPlace = false;
        this.gait.reset();

        // Calcular posições iniciais e alvos de abertura máxima radial (95% do alcance)
        const hipWorld = new THREE.Vector3();
        this.legs.forEach((leg) => {
            leg.deathStartFootPos = leg.currentTarget.clone();

            if (leg.baseNode) {
                leg.baseNode.getWorldPosition(hipWorld);
            } else {
                hipWorld.set(this.walkerState.posX, this.walkerState.bodyHeight, this.walkerState.posZ);
            }

            // Direção horizontal do quadril até a pata
            const dirX = leg.currentTarget.x - hipWorld.x;
            const dirZ = leg.currentTarget.z - hipWorld.z;
            const hDist = Math.hypot(dirX, dirZ) || 1.0;
            const normX = dirX / hDist;
            const normZ = dirZ / hDist;

            // 95% do comprimento total calibrado da perna (L1 + L2 + L3)
            const totalReach = (leg.L1 + leg.L2 + leg.L3) || 7.32;
            const maxSplayDist = totalReach * 0.95;

            leg.deathMaxSplayPos = new THREE.Vector3(
                hipWorld.x + normX * maxSplayDist,
                leg.currentTarget.y,
                hipWorld.z + normZ * maxSplayDist
            );
        });

        this.eventBus.emit('bot:died');
    }

    /**
     * Atualiza os estágios da coreografia de morte da HX a cada quadro.
     * @param {number} dt Delta time em segundos
     * @param {Function} getTerrainHeightFn Função de altitude do solo
     */
    updateDeathSequence(dt, getTerrainHeightFn) {
        this.deathTimer += dt;
        const tCollapse = 0.40; // 400ms para despencar a altura do corpo (0.10, Fast-In)
        const tSplay = 0.70;    // 700ms para abrir as patas até 95% do alcance (Easy-Out, Fast-In)

        // 1. Descer a altura do corpo (0.10, Fast-In)
        if (this.deathTimer < tCollapse) {
            const p = THREE.MathUtils.clamp(this.deathTimer / tCollapse, 0.0, 1.0);
            // Fast-In (Aceleração rápida para despencar no solo): p^3
            const easeFastIn = p * p * p;
            this.walkerState.bodyHeight = THREE.MathUtils.lerp(this.deathStartBodyHeight, 0.10, easeFastIn);
        } else {
            this.walkerState.bodyHeight = 0.10;

            // 2. Acionar o primeiro tranco de dano cômico ao tocar o chão
            if (!this.deathJolt1Done) {
                this.deathJolt1Done = true;
                this.triggerDamageReaction(0);
                this.deathState = 'SPLAYING';
            }
        }

        // 3. Aumentar a abertura da pata até 95% do comprimento total dela (Easy-Out / Fast-In)
        if (this.deathTimer >= tCollapse) {
            const splayElapsed = this.deathTimer - tCollapse;
            const pSplay = THREE.MathUtils.clamp(splayElapsed / tSplay, 0.0, 1.0);

            // Curva Easy-Out / Fast-In: 1 - (1 - p)^3
            const easeSplay = 1.0 - Math.pow(1.0 - pSplay, 3.0);

            this.legs.forEach((leg) => {
                if (leg.deathStartFootPos && leg.deathMaxSplayPos) {
                    const groundY = getTerrainHeightFn(leg.deathMaxSplayPos.x, leg.deathMaxSplayPos.z);
                    leg.deathMaxSplayPos.y = groundY;

                    leg.currentTarget.lerpVectors(leg.deathStartFootPos, leg.deathMaxSplayPos, easeSplay);
                }
            });

            // 4. Acionar o dano cômico 2x durante e ao final da abertura total
            // Jolt 2 (Meio do deslizamento das patas):
            if (pSplay >= 0.50 && !this.deathJolt2Done) {
                this.deathJolt2Done = true;
                this.triggerDamageReaction(0);
            }

            // Jolt 3 (Ao travar na abertura de 95%):
            if (pSplay >= 1.0 && !this.deathJolt3Done) {
                this.deathJolt3Done = true;
                this.triggerDamageReaction(0);
                this.deathState = 'PARALYZED';
            }
        }
    }

    /**
     * Dispara a reação cômica de dano com tremor, abatimento de HP e morph targets.
     * @param {number} [amount=250] Dano sofrido
     */
    triggerDamageReaction(amount = 250) {
        // Se a HX já estiver paralisada em estado de morte, não aciona mais tremor nem reseta animação
        if (this.isDead && (this.deathState === 'PARALYZED' || this.deathTimer >= 1.10)) {
            return;
        }

        this.damageReactionTimer = this.DAMAGE_DURATION;
        const dmg = typeof amount === 'number' ? amount : 250;
        this.hp = Math.max(0, this.hp - dmg);

        // Se a vida zerou por dano de combate e ainda não morreu, inicia a morte
        if (this.hp <= 0 && !this.isDead) {
            this.triggerDeath();
        }
    }

    /**
     * Alterna a visualização do modo Raio-X Biomecânico.
     */
    toggleXRay() {
        this.xrayMode = !this.xrayMode;
        this.skeletonLinesGroup.visible = this.xrayMode;
        this.footTargetGroup.visible = this.xrayMode;
        if (this.modelRoot) {
            this.modelRoot.traverse((c) => {
                if (c.isMesh) c.visible = !this.xrayMode;
            });
        }
        this.eventBus.emit('bot:xrayChanged', this.xrayMode);
    }

    /**
     * Reseta as variáveis de locomoção e posicionamento do robô.
     * @param {Function} [getTerrainHeightFn=null]
     */
    resetWalker(getTerrainHeightFn = null) {
        // Restaurar estado de vida
        this.isDead = false;
        this.deathState = 'ALIVE';
        this.deathTimer = 0.0;
        this.deathJolt1Done = false;
        this.deathJolt2Done = false;
        this.deathJolt3Done = false;

        this.walkerState.posX = 0;
        this.walkerState.posZ = 0;
        this.walkerState.baseHeading = 0;
        this.walkerState.torsoYaw = 0;
        this.walkerState.travelHeading = 0;
        this.walkerState.aimWorldPoint.set(0, 0, 18);
        this.walkerState.aimWorldNormal.set(0, 1, 0);
        this.walkerState.camAzimuth = Math.PI;
        this.walkerState.terrainElevationY = 0;
        this.walkerState.terrainPitch = 0;
        this.walkerState.terrainRoll = 0;
        this.walkerState.dynLift = 0;
        this.walkerState.dynShiftZ = 0;
        this.walkerState.dynPitch = 0;
        this.walkerState.bodyHeight = this.activeBotManifest?.calibration?.defaultHeight || 1.70;
        this.damageReactionTimer = 0.0;
        this.isVictoryDancing = false;
        this.victoryDanceTimer = 0.0;

        // Restaurar integridade e energia
        this.hp = this.maxHp;
        this.energy = this.maxEnergy;
        this.isEnergyDepleted = false;
        this.lockedTarget = null;
        if (this.lockConeMesh) this.lockConeMesh.visible = false;

        this.gait.reset();
        this.sway.reset();

        this.prevBaseHeading = 0;
        this.prevTorsoYaw = 0;
        this.prevDynPitch = 0;
        this.prevTerrainPitch = 0;
        this.prevTerrainRoll = 0;
        this.smoothedAngularSpeed = 0;

        this.robotMasterGroup.position.set(0, 0, 0);
        this.robotMasterGroup.rotation.set(0, 0, 0);
        this.updateAllLegNominalOffsets(getTerrainHeightFn);
    }

    /**
     * Alterna a trava de mira (Lock-On) no alvo atualmente sob o cursor.
     */
    toggleTargetLock() {
        if (this.lockedTarget) {
            this.lockedTarget = null;
            if (this.lockConeMesh) this.lockConeMesh.visible = false;
            console.log('[HexaBot] Trava de mira desativada.');
        } else if (this.currentInputManager && this.currentInputManager.hoveredEntity) {
            const entity = this.currentInputManager.hoveredEntity;
            if (!entity.isDead && !entity.isFinished && !entity.isDestroyed) {
                this.lockedTarget = entity;
                console.log('[HexaBot] Trava de mira ativada no alvo:', entity);
            }
        }
    }

    /**
     * Constrói o indicador visual 3D do cone azul holográfico invertido de mira travada.
     */
    buildLockCone() {
        const coneGeo = new THREE.ConeGeometry(0.38, 0.85, 16);
        coneGeo.rotateX(Math.PI); // Inverter para a ponta apontar para BAIXO

        const coneMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.90,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.lockConeMesh = new THREE.Mesh(coneGeo, coneMat);
        this.lockConeMesh.visible = false;
        this.scene.add(this.lockConeMesh);

        // Anel tecnológico sci-fi acima do cone
        const ringGeo = new THREE.RingGeometry(0.42, 0.52, 24);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.80,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        this.lockRingMesh = new THREE.Mesh(ringGeo, ringMat);
        this.lockConeMesh.add(this.lockRingMesh);
        this.lockRingMesh.position.y = 0.52;
    }

    /**
     * Atualiza a posição e animação flutuante/rotatória do cone azul sobre o alvo travado.
     * @param {number} dt
     * @param {number} elapsedTime
     */
    updateLockCone(dt, elapsedTime) {
        if (!this.lockedTarget || !this.lockConeMesh) {
            if (this.lockConeMesh) this.lockConeMesh.visible = false;
            return;
        }

        this.lockConeMesh.visible = true;

        const tPos = this.lockedTarget.position;
        const baseHeight = (this.lockedTarget.height ? this.lockedTarget.height + 0.8 : 2.0);
        const bobbing = Math.sin(elapsedTime * 6.5) * 0.16;

        this.lockConeMesh.position.set(tPos.x, tPos.y + baseHeight + bobbing, tPos.z);
        this.lockConeMesh.rotation.y = elapsedTime * 3.5;
        this.lockRingMesh.rotation.z = -elapsedTime * 4.0;
    }

    /**
     * Ciclo principal de atualização da criatura.
     * @param {number} dt Delta time em segundos
     * @param {number} elapsedTime Tempo total
     * @param {import('../core/InputManager.js').InputManager} inputManager Gerenciador de inputs
     * @param {import('../world/CollisionSystem.js').CollisionSystem} collisionSystem Sistema de colisões
     * @param {import('../world/TerrainArena.js').TerrainArena} terrainArena Arena com terreno e obstáculos
     * @param {import('../combat/EnemyManager.js').EnemyManager} [enemyManager] Gerenciador de inimigos
     */
    update(dt, elapsedTime, inputManager, collisionSystem, terrainArena, enemyManager = null) {
        this.currentInputManager = inputManager;

        const getTerrainHeightFn = (x, z) => terrainArena.getTerrainHeight(x, z);
        const getBaseGroundMeshHeightFn = (x, z) => terrainArena.getBaseGroundMeshHeight(x, z);
        const allAimTargetableMeshes = enemyManager ? enemyManager.getAllAimTargetableMeshes() : terrainArena.aimTargetableMeshes;

        // 1. Raycast de Mira do Mouse na Arena e Inimigos
        inputManager.projectMouseToWorld(
            this.scene.parentCamera || this.scene.__camera, // Câmera referenciada
            allAimTargetableMeshes,
            getTerrainHeightFn,
            this.walkerState.aimWorldPoint,
            this.walkerState.aimWorldNormal
        );

        // Se houver um alvo travado pela barra de espaço, sobrescreve o ponto de mira para focar no alvo
        if (this.lockedTarget) {
            if (this.lockedTarget.isDead || this.lockedTarget.isFinished || this.lockedTarget.isDestroyed) {
                this.lockedTarget = null;
            } else {
                const tPos = this.lockedTarget.position;
                const heightOffset = (this.lockedTarget.height ? this.lockedTarget.height * 0.5 : 0.65);
                this.walkerState.aimWorldPoint.set(tPos.x, tPos.y + heightOffset, tPos.z);
                this.walkerState.aimWorldNormal.set(0, 1, 0);
            }
        }

        // Atualizar indicador visual da trava de mira (Cone Azul)
        this.updateLockCone(dt, elapsedTime);

        // 2. Leitura de Movimentação WASD (Bloqueado se estiver morto ou na Dança da Vitória)
        const { moveFwd: rawMoveFwd, moveSide: rawMoveSide, isMoving: rawIsMoving } = inputManager.getMovementVector();
        const moveFwd = (this.isDead || this.isVictoryDancing) ? 0 : rawMoveFwd;
        const moveSide = (this.isDead || this.isVictoryDancing) ? 0 : rawMoveSide;
        const isMoving = (this.isDead || this.isVictoryDancing) ? false : rawIsMoving;
        this.walkerState.isMoving = isMoving;

        // 3. Mira em Dois Níveis (Dual-Tier Aiming) & Proximidade
        const aimDX = this.walkerState.aimWorldPoint.x - this.walkerState.posX;
        const aimDZ = this.walkerState.aimWorldPoint.z - this.walkerState.posZ;
        const toAimDistH = Math.hypot(aimDX, aimDZ);
        const targetAimAngle = (toAimDistH > 0.01)
            ? Math.atan2(aimDX, aimDZ)
            : (this.walkerState.baseHeading || 0);

        // Velocidade integral de avanço (sem redução ao combater inimigos próximos)
        const effectiveMoveSpeed = (this.isDead || this.isVictoryDancing) ? 0 : this.walkerState.moveSpeed;

        let deltaAngle = targetAimAngle - (this.walkerState.baseHeading || 0);
        deltaAngle = Math.atan2(Math.sin(deltaAngle), Math.cos(deltaAngle));
        if (isNaN(deltaAngle)) deltaAngle = 0;

        const comfortLimit = this.walkerState.comfortAngle; // 25 graus

        if (this.isDead || this.isVictoryDancing) {
            // Se estiver morto ou dançando, reseta a torção do tronco suavemente
            this.walkerState.torsoYaw = THREE.MathUtils.damp(this.walkerState.torsoYaw || 0, 0, 8.0, dt);
            this.walkerState.isTurningInPlace = false;
            this.walkerState.turnDir = 0;
        } else if (Math.abs(deltaAngle) <= comfortLimit) {
            // Zona de conforto: Apenas torce o tronco, patas firmes no chão
            this.walkerState.torsoYaw = THREE.MathUtils.damp(this.walkerState.torsoYaw || 0, deltaAngle, 10.0, dt);
            this.walkerState.isTurningInPlace = false;
            this.walkerState.turnDir = 0;
        } else {
            // Fora da zona de conforto: Tronco no limite e passadas de pivô
            const sign = Math.sign(deltaAngle) || 1;
            this.walkerState.torsoYaw = THREE.MathUtils.damp(this.walkerState.torsoYaw || 0, sign * comfortLimit, 8.0, dt);
            this.walkerState.isTurningInPlace = true;
            this.walkerState.turnDir = sign;
        }

        // Dinâmica Reativa de Proximidade
        const proxThreshold = 16.0;
        const proxLinear = THREE.MathUtils.clamp((proxThreshold - toAimDistH) / proxThreshold, 0.0, 1.0);
        const proxLog = Math.log(1.0 + 4.0 * proxLinear) / Math.log(5.0);

        const targetLift = this.isDead ? 0 : proxLog * 0.35;
        const targetShiftZ = this.isDead ? 0 : -proxLog * 0.40;

        const currentTerrainY = getTerrainHeightFn(this.walkerState.posX, this.walkerState.posZ);
        const bodyElevation = (this.walkerState.terrainElevationY !== undefined) ? this.walkerState.terrainElevationY : currentTerrainY;
        const effectiveBodyY = bodyElevation + this.walkerState.bodyHeight + targetLift;
        const heightDiff = effectiveBodyY - this.walkerState.aimWorldPoint.y;
        const pitchDownAngle = Math.atan2(heightDiff, Math.max(toAimDistH, 2.5));
        const minPitch = -THREE.MathUtils.degToRad(35.0);
        const maxPitch = THREE.MathUtils.degToRad(35.0);
        const targetPitch = this.isDead ? 0 : THREE.MathUtils.clamp(pitchDownAngle, minPitch, maxPitch);

        this.walkerState.dynLift = THREE.MathUtils.damp(this.walkerState.dynLift || 0, targetLift, 6.0, dt);
        this.walkerState.dynShiftZ = THREE.MathUtils.damp(this.walkerState.dynShiftZ || 0, targetShiftZ, 6.0, dt);
        this.walkerState.dynPitch = THREE.MathUtils.damp(this.walkerState.dynPitch || 0, targetPitch, 6.0, dt);

        // 4. Vetor de Deslocamento Global
        const moveVec = new THREE.Vector3();
        if (this.walkerState.isMoving) {
            moveVec.set(moveSide, 0, moveFwd).normalize();
            moveVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.walkerState.baseHeading);
            this.walkerState.travelHeading = Math.atan2(moveVec.x, moveVec.z);
        } else if (this.walkerState.isTurningInPlace) {
            this.walkerState.travelHeading = this.walkerState.baseHeading;
        }

        // 5. Atualização da Marcha Tripé ou Sequência de Morte
        let gaitResult = null;
        if (!this.isDead) {
            gaitResult = this.gait.update(dt, {
                wantsMove: this.walkerState.isMoving,
                wantsTurn: this.walkerState.isTurningInPlace,
                turnDir: this.walkerState.turnDir,
                moveVec,
                effectiveMoveSpeed,
                walkerState: this.walkerState,
                legs: this.legs,
                collisionSystem,
                terrainArena
            });

            // Disparar som mecânico de impacto de passo (Touchdown)
            if (gaitResult && gaitResult.didStepLand) {
                this.eventBus.emit('sound:step', this.robotMasterGroup.position);
            }
        } else {
            this.updateDeathSequence(dt, getTerrainHeightFn);
        }

        // 6. Equilíbrio e Inclinação de Relevo (Terrain Balancing)
        let sumFootY = 0;
        let frontY = 0;
        let rearY = 0;
        let leftY = 0;
        let rightY = 0;
        const footCount = this.legs.length || 6;

        this.legs.forEach((leg) => {
            const fy = leg.currentTarget.y;
            sumFootY += fy;
            if (leg.id === 'FR' || leg.id === 'FL') frontY += fy * 0.5;
            if (leg.id === 'BR' || leg.id === 'BL') rearY += fy * 0.5;
            if (leg.side === 'E') leftY += fy / 3;
            if (leg.side === 'D') rightY += fy / 3;
        });

        const avgFootY = sumFootY / footCount;
        const groundCenterY = getTerrainHeightFn(this.walkerState.posX, this.walkerState.posZ);
        const targetBaseY = Math.max(groundCenterY, avgFootY);

        this.walkerState.terrainElevationY = THREE.MathUtils.damp(this.walkerState.terrainElevationY || targetBaseY, targetBaseY, 8.0, dt);

        const stanceSpanZ = Math.max(7.0 * (this.walkerState.bodyHeight / 1.7), 4.0);
        const rawTerrainPitch = -Math.atan2(frontY - rearY, stanceSpanZ) * 0.55;
        this.walkerState.terrainPitch = THREE.MathUtils.damp(this.walkerState.terrainPitch || 0, rawTerrainPitch, 6.0, dt);

        const stanceSpanX = Math.max(9.0 * (this.walkerState.bodyHeight / 1.7), 5.0);
        const rawTerrainRoll = Math.atan2(leftY - rightY, stanceSpanX) * 0.55;
        this.walkerState.terrainRoll = THREE.MathUtils.damp(this.walkerState.terrainRoll || 0, rawTerrainRoll, 6.0, dt);

        // 7. Dinâmica Física de Dano no Chassi (Damped Spring Shockwave)
        let damageJoltX = 0.0;
        let damageJoltY = 0.0;
        let damageJoltZ = 0.0;
        let damageWobblePitch = 0.0;
        let damageWobbleRoll = 0.0;
        let damageWobbleYaw = 0.0;
        let damageIntensity = 0.0;

        if (this.isDead && (this.deathState === 'PARALYZED' || this.deathTimer >= 1.10)) {
            this.damageReactionTimer = 0.0;
        }

        if (this.damageReactionTimer > 0) {
            this.damageReactionTimer = Math.max(0.0, this.damageReactionTimer - dt);
            const tImpact = this.DAMAGE_DURATION - this.damageReactionTimer;
            const decay = Math.exp(-5.2 * tImpact);

            // Durante o colapso e morte, não puxa o chassi para cima em Y
            const joltYScale = this.isDead ? 0.0 : 1.0;

            damageJoltZ = -0.45 * Math.cos(tImpact * 20.0) * decay;
            damageJoltX = 0.26 * Math.sin(tImpact * 26.0) * decay;
            damageJoltY = -0.18 * Math.sin(tImpact * 22.0) * decay * joltYScale;

            damageWobblePitch = -0.25 * Math.cos(tImpact * 18.0) * decay;
            damageWobbleRoll = 0.16 * Math.sin(tImpact * 24.0) * decay;
            damageWobbleYaw = 0.10 * Math.sin(tImpact * 21.0) * decay;

            if (tImpact < 0.10) {
                damageIntensity = tImpact / 0.10;
            } else {
                const decayT = (tImpact - 0.10) / (this.DAMAGE_DURATION - 0.10);
                damageIntensity = Math.pow(1.0 - decayT, 2.0);
            }
        }

        // Luz Vermelha de Alerta de Dano
        const targetDamageLightIntensity = (damageIntensity > 0.01)
            ? (52.0 * damageIntensity + Math.sin(elapsedTime * 40.0) * 14.0 * damageIntensity)
            : 0.0;
        this.damageUnderLight.intensity = THREE.MathUtils.damp(this.damageUnderLight.intensity, targetDamageLightIntensity, 28.0, dt);
        this.damageUnderLight.position.set(
            this.walkerState.posX,
            this.walkerState.terrainElevationY + 0.65,
            this.walkerState.posZ
        );

        // 8. Auto-Sway / Idle Breathing
        const isBotIdle = !this.isDead &&
                          !this.walkerState.isMoving &&
                          !this.walkerState.isTurningInPlace &&
                          !this.gait.isStepActive &&
                          !inputManager.isAimFiring &&
                          !inputManager.isMiddleDragging &&
                          !this.isVictoryDancing &&
                          (this.damageReactionTimer <= 0);

        const swayRes = this.sway.update(dt, elapsedTime, {
            isBotIdle,
            timeSinceLastInput: inputManager.getTimeSinceLastInput(),
            activeBotManifest: this.activeBotManifest,
            bodyHeight: this.walkerState.bodyHeight
        });

        // 8.1 Cálculo Procedural da Dança da Vitória (Funk Groove a 1 Batida por Segundo)
        let danceBounce = 0.0;
        let danceShiftZ = 0.0;
        let dancePitch = 0.0;
        let danceRoll = 0.0;
        let danceYaw = 0.0;

        if (this.isVictoryDancing && !this.isDead) {
            this.victoryDanceTime = (this.victoryDanceTime || 0) + dt;
            const t = this.victoryDanceTime % 4.0;
            const beatNum = Math.floor(t);
            const beatProgress = t - beatNum;

            // Heave bounce constante no beat do funk (1 por segundo)
            const beatBounce = Math.abs(Math.sin(beatProgress * Math.PI)) * 0.28;
            danceBounce = beatBounce;

            if (beatNum === 0) {
                // Beat 0 (0-1s): Swing e roll para a esquerda, pata FL sobe
                danceRoll = -Math.sin(beatProgress * Math.PI) * THREE.MathUtils.degToRad(14.0);
                danceYaw = -Math.sin(beatProgress * Math.PI) * THREE.MathUtils.degToRad(12.0);
                dancePitch = Math.sin(beatProgress * Math.PI) * THREE.MathUtils.degToRad(6.0);
            } else if (beatNum === 1) {
                // Beat 1 (1-2s): Swing e roll para a direita, pata FR sobe
                danceRoll = Math.sin(beatProgress * Math.PI) * THREE.MathUtils.degToRad(14.0);
                danceYaw = Math.sin(beatProgress * Math.PI) * THREE.MathUtils.degToRad(12.0);
                dancePitch = Math.sin(beatProgress * Math.PI) * THREE.MathUtils.degToRad(6.0);
            } else if (beatNum === 2) {
                // Beat 2 (2-3s): Double bounce / Raise the roof! Tronco empina para cima
                danceBounce = Math.abs(Math.sin(beatProgress * Math.PI * 2.0)) * 0.35;
                dancePitch = -Math.sin(beatProgress * Math.PI) * THREE.MathUtils.degToRad(15.0);
                danceShiftZ = -Math.sin(beatProgress * Math.PI) * 0.15;
            } else if (beatNum === 3) {
                // Beat 3 (3-4s): Funk drop squat e impulso
                danceBounce = -Math.sin(beatProgress * Math.PI) * 0.30;
                dancePitch = Math.sin(beatProgress * Math.PI) * THREE.MathUtils.degToRad(12.0);
                danceShiftZ = Math.sin(beatProgress * Math.PI) * 0.10;
            }
        }

        // 9. Atualizar Sistema de Combate Laser (Bloqueia durante a Dança da Vitória, caso a energia zere ou se estiver morto)
        const canFireLaser = !this.isDead && !this.isVictoryDancing && !this.isEnergyDepleted && (this.energy > 0.0);
        const combatRes = this.combat.update(dt, elapsedTime, {
            isAimFiring: inputManager.isAimFiring && canFireLaser,
            bodyGroup: this.bodyGroup,
            aimWorldPoint: this.walkerState.aimWorldPoint,
            aimWorldNormal: this.walkerState.aimWorldNormal,
            targetAimAngle,
            baseHeading: this.walkerState.baseHeading,
            torsoYaw: this.walkerState.torsoYaw,
            aimTargetableMeshes: allAimTargetableMeshes,
            getBaseGroundMeshHeightFn
        });

        // Consumo de energia no disparo e regeneração contínua
        if (combatRes.isActuallyFiring) {
            this.energy = Math.max(0.0, this.energy - 24.0 * dt);
            if (this.energy <= 0.0) {
                this.energy = 0.0;
                this.isEnergyDepleted = true; // Trava o canhão até atingir 100% de carga
            }
        } else {
            this.energy = Math.min(this.maxEnergy, this.energy + 15.0 * dt);
            // Destrava quando a recarga for completa (100%)
            if (this.isEnergyDepleted && this.energy >= this.maxEnergy) {
                this.energy = this.maxEnergy;
                this.isEnergyDepleted = false;
            }
        }

        // Áudio do Laser Contínuo com Envelope ADSR (Attack, Sustain e Decay)
        if (combatRes.isActuallyFiring) {
            this.eventBus.emit('sound:laserStart', combatRes.snoutPos);
        } else if (this.wasFiringLaser) {
            this.eventBus.emit('sound:laserStop');
        }
        this.wasFiringLaser = combatRes.isActuallyFiring;

        // Aplicar dano do laser contínuo no alvo que o raio realmente atinge
        if (combatRes.isActuallyFiring && combatRes.hitObject && enemyManager) {
            enemyManager.applyLaserDamage(combatRes.hitObject, dt);
        }

        // 10. Atualizar Morph Targets
        this.shapeKeys.update(dt, elapsedTime, combatRes.isActuallyFiring, damageIntensity, this.isDead, this.isVictoryDancing);

        // 11. Posicionamento do Chassi no Mundo
        this.robotMasterGroup.position.set(
            this.walkerState.posX,
            this.walkerState.terrainElevationY,
            this.walkerState.posZ
        );
        this.robotMasterGroup.rotation.set(
            this.walkerState.terrainPitch,
            this.walkerState.baseHeading,
            this.walkerState.terrainRoll,
            'YXZ'
        );

        this.bodyGroup.position.set(
            damageJoltX + swayRes.swayX,
            this.walkerState.bodyHeight + this.walkerState.dynLift + damageJoltY + swayRes.swayY + danceBounce,
            this.walkerState.dynShiftZ + combatRes.shootingShiftZ + damageJoltZ + swayRes.swayZ + danceShiftZ
        );
        this.bodyGroup.rotation.set(
            this.walkerState.dynPitch + damageWobblePitch + swayRes.swayPitch + dancePitch,
            this.walkerState.torsoYaw + damageWobbleYaw + swayRes.swayYaw + danceYaw,
            damageWobbleRoll + swayRes.swayRoll + danceRoll,
            'YXZ'
        );

        this.robotMasterGroup.updateMatrixWorld(true);

        // 12. Executar Solver IK em Todas as Pernas
        const currentElevation = IKSolver.calculateAdaptiveElevation(
            this.walkerState.bodyHeight + this.walkerState.dynLift + danceBounce
        );
        this.legs.forEach((leg) => {
            let ikTarget = leg.currentTarget;
            if (this.isVictoryDancing && (leg.id === 'FL' || leg.id === 'FR')) {
                const t = (this.victoryDanceTime || 0) % 4.0;
                const beatNum = Math.floor(t);
                const beatProgress = t - beatNum;

                this.tempDanceTarget.copy(leg.currentTarget);

                if (beatNum === 0 && leg.id === 'FL') {
                    // Beat 0: Pata FL acenando no ar ao ritmo funk
                    const wave = Math.sin(beatProgress * Math.PI);
                    this.tempDanceTarget.y += wave * 1.15;
                    this.tempDanceTarget.x -= wave * 0.45;
                    this.tempDanceTarget.z += wave * 0.35;
                    ikTarget = this.tempDanceTarget;
                } else if (beatNum === 1 && leg.id === 'FR') {
                    // Beat 1: Pata FR acenando no ar ao ritmo funk
                    const wave = Math.sin(beatProgress * Math.PI);
                    this.tempDanceTarget.y += wave * 1.15;
                    this.tempDanceTarget.x += wave * 0.45;
                    this.tempDanceTarget.z += wave * 0.35;
                    ikTarget = this.tempDanceTarget;
                } else if (beatNum === 2) {
                    // Beat 2: Ambas patas FL e FR no ar (Raise the Roof!)
                    const wave = Math.sin(beatProgress * Math.PI);
                    const sign = (leg.id === 'FL' ? -1 : 1);
                    this.tempDanceTarget.y += wave * 1.40;
                    this.tempDanceTarget.x += sign * wave * 0.50;
                    this.tempDanceTarget.z += wave * 0.40;
                    ikTarget = this.tempDanceTarget;
                } else if (beatNum === 3) {
                    // Beat 3: Patas no solo com leve abertura lateral no drop squat
                    const spread = Math.sin(beatProgress * Math.PI) * 0.25;
                    const sign = (leg.id === 'FL' ? -1 : 1);
                    this.tempDanceTarget.x += sign * spread;
                    ikTarget = this.tempDanceTarget;
                }
            }

            if (leg.targetMesh) {
                leg.targetMesh.position.copy(ikTarget);
            }
            IKSolver.solveLegIK(leg, ikTarget, currentElevation, this.xrayMode);
        });

        // 13. Cálculo da Velocidade Angular Instantânea e Modulação dos Servos (motor.mp3)
        if (dt > 0.0001) {
            let dHeading = this.walkerState.baseHeading - this.prevBaseHeading;
            dHeading = Math.atan2(Math.sin(dHeading), Math.cos(dHeading));

            const dTorso = this.walkerState.torsoYaw - this.prevTorsoYaw;
            const dPitch = (this.walkerState.dynPitch + this.walkerState.terrainPitch) - (this.prevDynPitch + this.prevTerrainPitch);
            const dRoll = this.walkerState.terrainRoll - this.prevTerrainRoll;

            const angSpeedYaw = Math.abs(dHeading + dTorso) / dt;
            const angSpeedPitch = Math.abs(dPitch) / dt;
            const angSpeedRoll = Math.abs(dRoll) / dt;
            const rawAngularSpeed = angSpeedYaw + (angSpeedPitch * 0.75) + (angSpeedRoll * 0.60);

            // Amortecimento prévio na velocidade angular para atenuar pulsos entre passadas de pivô
            this.smoothedAngularSpeed = THREE.MathUtils.damp(this.smoothedAngularSpeed || 0, rawAngularSpeed, 7.5, dt);

            this.prevBaseHeading = this.walkerState.baseHeading;
            this.prevTorsoYaw = this.walkerState.torsoYaw;
            this.prevDynPitch = this.walkerState.dynPitch;
            this.prevTerrainPitch = this.walkerState.terrainPitch;
            this.prevTerrainRoll = this.walkerState.terrainRoll;

            this.eventBus.emit('bot:motorUpdate', {
                angularSpeed: this.isDead ? 0 : this.smoothedAngularSpeed,
                isMoving: !this.isDead && this.walkerState.isMoving,
                isTurningInPlace: !this.isDead && this.walkerState.isTurningInPlace,
                moveSpeed: this.isDead ? 0 : effectiveMoveSpeed,
                dt
            });
        }

        // 14. Emitir Telemetria para a UI
        this.eventBus.emit('bot:telemetry', {
            walkerState: this.walkerState,
            effectiveMoveSpeed,
            swayWeight: swayRes.swayWeight,
            activeTripodGroup: this.gait.activeTripodGroup,
            isGaitActive: this.walkerState.isMoving || this.walkerState.isTurningInPlace || this.gait.isStepActive,
            hp: this.hp,
            maxHp: this.maxHp,
            energy: this.energy,
            maxEnergy: this.maxEnergy,
            isEnergyDepleted: this.isEnergyDepleted
        });
    }
}
