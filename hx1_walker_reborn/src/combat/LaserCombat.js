/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — LASERCOMBAT.JS
 * Sistema Tático de Disparo, Feixe Volumétrico, FOV 60° e Oclusão de Areia
 * ============================================================================
 * Implementa o combate e efeitos visuais de energia dos mechas HX:
 * 1. Campo de Visão Restrito (FOV 60°):
 *    - O disparo só é liberado quando a mira estiver alinhada dentro de ±30° em relação
 *      à frente da cabeça/focinho.
 * 2. Oclusão de Linha de Visada (Obstáculos + Dunas de Areia):
 *    - Raycasting contra blocos sólidos e amostragem analítica ultrarrápida (0ms) do
 *      relevo de areia ao longo do feixe.
 * 3. Feedback Tático do Retículo e Linha Guia:
 *    - Ciano (#38bdf8): Alvo desobstruído e pronto no FOV.
 *    - Âmbar (#f59e0b): Fora do FOV (robô pivoteando).
 *    - Vermelho (#ef4444): Linha de visada obstruída por relevo ou pilar.
 * 4. Feixe Volumétrico de Plasma:
 *    - Núcleo super-emitente branco + bainha ciano oscilante + clarão de boca + luz de impacto.
 * 5. Projeção de Recuo no Chassi (Shooting Shift):
 *    - Avanço rápido no disparo (fast-in) e retorno elástico em 500ms (easy-out).
 */

import * as THREE from 'three';

export class LaserCombat {
    /**
     * @param {THREE.Scene} scene Cena principal Three.js
     */
    constructor(scene) {
        this.scene = scene;

        // Estado do disparo
        this.isActuallyFiring = false;
        this.shootingShiftZ = 0.0;
        this.shootingReleaseTime = -999.0;
        this.wasLaserShootingShift = false;

        // Helpers de Raycasting e Transformações
        this.tempSnout = new THREE.Vector3();
        this.laserRaycaster = new THREE.Raycaster();
        this.laserRayDir = new THREE.Vector3();
        this.tempLaserHitNormal = new THREE.Vector3();
        this.upVec = new THREE.Vector3(0, 1, 0);
        this.laserBeamVec = new THREE.Vector3();
        this.laserBeamMid = new THREE.Vector3();
        this.laserBeamDir = new THREE.Vector3();
        this.laserBeamQuat = new THREE.Quaternion();
        this.sandContactPoint = new THREE.Vector3();

        // Elemento DOM do Retículo
        this.crosshairRingElem = document.getElementById('crosshair-ring');

        // Sistema de Partículas — Brasas e Faíscas de Solda em Arco (Welding Sparks Fountain)
        this.maxSparks = 320;
        this.sparks = [];
        this.sparkPositions = new Float32Array(this.maxSparks * 3);
        this.sparkColors = new Float32Array(this.maxSparks * 3);
        this.sparkSizes = new Float32Array(this.maxSparks);
        this.prevContactPoint = new THREE.Vector3();
        this.emitterVelocity = new THREE.Vector3();
        this.hasPrevContact = false;

        for (let i = 0; i < this.maxSparks; i++) {
            this.sparks.push({
                active: false,
                pos: new THREE.Vector3(0, -999, 0),
                vel: new THREE.Vector3(0, 0, 0),
                life: 0.0,
                maxLife: 1.0,
                baseSize: 1.5,
                bounceCount: 0
            });
            this.sparkPositions[i * 3 + 0] = 0;
            this.sparkPositions[i * 3 + 1] = -999;
            this.sparkPositions[i * 3 + 2] = 0;
            this.sparkColors[i * 3 + 0] = 1;
            this.sparkColors[i * 3 + 1] = 1;
            this.sparkColors[i * 3 + 2] = 1;
            this.sparkSizes[i] = 0.0;
        }

        // Texturas procedurais de plasma e brilho volumétrico
        this.sparkTexture = this.createSparkTexture();
        this.plasmaBloomTexture = this.createPlasmaBloomTexture();

        // Construir malhas e luzes do sistema de combate
        this.buildLaserMeshes();
    }

    /**
     * Gera uma textura procedural circular com núcleo hiper-brilhante e halo suave.
     * @returns {THREE.CanvasTexture}
     */
    createSparkTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
        gradient.addColorStop(0.12, 'rgba(220, 250, 255, 0.98)');
        gradient.addColorStop(0.30, 'rgba(0, 240, 255, 0.85)');
        gradient.addColorStop(0.55, 'rgba(0, 140, 255, 0.45)');
        gradient.addColorStop(0.82, 'rgba(0, 60, 220, 0.15)');
        gradient.addColorStop(1.0, 'rgba(0, 20, 160, 0.0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);

        const texture = new THREE.CanvasTexture(canvas);
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Gera uma textura de difusão de aura suave / plasma bloom para a área de impacto.
     * @returns {THREE.CanvasTexture}
     */
    createPlasmaBloomTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0.0, 'rgba(180, 245, 255, 0.90)');
        gradient.addColorStop(0.25, 'rgba(0, 220, 255, 0.65)');
        gradient.addColorStop(0.55, 'rgba(0, 120, 255, 0.30)');
        gradient.addColorStop(0.85, 'rgba(0, 40, 200, 0.08)');
        gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);

        const texture = new THREE.CanvasTexture(canvas);
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Cria os objetos gráficos (feixe volumétrico, clarão de boca, pontos de impacto e luzes).
     */
    buildLaserMeshes() {
        // 1. Linha Guia do Laser
        this.laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        this.laserMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.50 });
        this.laserLine = new THREE.Line(this.laserGeo, this.laserMat);
        this.scene.add(this.laserLine);

        // Geometria Cilíndrica Base para Feixes de Energia (Centro em 0, altura 1.0)
        const beamCylGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);

        // 2. Núcleo Super-Emitente Branco/Ciano (Inner Core)
        this.laserCoreMat = new THREE.MeshBasicMaterial({
            color: 0xf0fdff,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        this.laserCoreMesh = new THREE.Mesh(beamCylGeo, this.laserCoreMat);
        this.laserCoreMesh.visible = false;
        this.scene.add(this.laserCoreMesh);

        // 3. Halo / Bainha de Plasma Espessa e Oscilante Ciano Neon (Outer Glow)
        this.laserGlowMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        this.laserGlowMesh = new THREE.Mesh(beamCylGeo, this.laserGlowMat);
        this.laserGlowMesh.visible = false;
        this.scene.add(this.laserGlowMesh);

        // 4. Clarão de Boca / Muzzle Flare no Focinho
        const muzzleFlareGeo = new THREE.SphereGeometry(0.28, 16, 16);
        this.muzzleFlareMat = new THREE.MeshBasicMaterial({
            color: 0x00f7ff,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.laserMuzzleFlare = new THREE.Mesh(muzzleFlareGeo, this.muzzleFlareMat);
        this.laserMuzzleFlare.visible = false;
        this.scene.add(this.laserMuzzleFlare);

        // Luz de Boca no Canhão / Focinho
        this.snoutMuzzleLight = new THREE.PointLight(0x00e5ff, 0.0, 12.0, 1.2);
        this.scene.add(this.snoutMuzzleLight);

        // Luz de Impacto na Superfície (Intensa iluminação dinâmica de solda a plasma)
        this.aimTargetLight = new THREE.PointLight(0x00e5ff, 0.0, 28.0, 0.7);
        this.aimTargetLight.position.set(0, 0.5, 0);
        this.scene.add(this.aimTargetLight);

        // Anel de Impacto Visual e Ponto Central no Solo / Paredes
        const aimImpactGeo = new THREE.RingGeometry(0.12, 0.70, 32);
        aimImpactGeo.rotateX(-Math.PI / 2);
        this.aimImpactMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });
        this.aimImpactRing = new THREE.Mesh(aimImpactGeo, this.aimImpactMat);
        this.scene.add(this.aimImpactRing);

        const aimCenterDotGeo = new THREE.SphereGeometry(0.16, 16, 16);
        this.aimCenterDotMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending
        });
        this.aimCenterDot = new THREE.Mesh(aimCenterDotGeo, this.aimCenterDotMat);
        this.scene.add(this.aimCenterDot);

        // 5. Sistema de Partículas — Faíscas / Brasas de Solda em Arco (Welding Sparks)
        this.sparkGeo = new THREE.BufferGeometry();
        this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
        this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkColors, 3));
        this.sparkGeo.setAttribute('size', new THREE.BufferAttribute(this.sparkSizes, 1));

        this.sparkMat = new THREE.PointsMaterial({
            size: 1.6,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            map: this.sparkTexture,
            sizeAttenuation: true
        });
        this.sparkPoints = new THREE.Points(this.sparkGeo, this.sparkMat);
        this.sparkPoints.frustumCulled = false;
        this.scene.add(this.sparkPoints);

        // 6. Corona / Clarão Glare Primário no Ponto de Impacto (Contact Glow Flare)
        this.tipCoronaMat = new THREE.SpriteMaterial({
            map: this.sparkTexture,
            color: 0xb0f8ff,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.tipCoronaSprite = new THREE.Sprite(this.tipCoronaMat);
        this.tipCoronaSprite.visible = false;
        this.scene.add(this.tipCoronaSprite);

        // 7. Aura Volumétrica Ampla de Plasma no Ponto de Impacto (Plasma Bloom Sprite)
        this.tipBloomMat = new THREE.SpriteMaterial({
            map: this.plasmaBloomTexture,
            color: 0x00d8ff,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.tipBloomSprite = new THREE.Sprite(this.tipBloomMat);
        this.tipBloomSprite.visible = false;
        this.scene.add(this.tipBloomSprite);
    }

    /**
     * Executa a atualização do sistema tático de tiro a cada frame.
     * @param {number} dt Delta time em segundos
     * @param {number} elapsedTime Tempo total decorrido
     * @param {Object} params
     * @param {boolean} params.isAimFiring Se o usuário está segurando o botão de disparo
     * @param {THREE.Object3D} params.bodyGroup Grupo do corpo do robô
     * @param {THREE.Vector3} params.aimWorldPoint Ponto de mira 3D projetado
     * @param {THREE.Vector3} params.aimWorldNormal Normal da superfície mirada
     * @param {number} params.targetAimAngle Ângulo de mira em relação ao norte
     * @param {number} params.baseHeading Rumo da base do robô
     * @param {number} params.torsoYaw Torção do tronco
     * @param {boolean} [params.isSupercharged=false] Se o laser está em modo Supercharge (500%)
     * @returns {{ isActuallyFiring: boolean, shootingShiftZ: number, snoutPos: THREE.Vector3, hitObject: THREE.Object3D|null }}
     */
    update(dt, elapsedTime, {
        isAimFiring,
        isSupercharged = false,
        bodyGroup,
        aimWorldPoint,
        aimWorldNormal,
        targetAimAngle,
        baseHeading,
        torsoYaw,
        aimTargetableMeshes,
        getBaseGroundMeshHeightFn
    }) {
        // 1. Campo de Visão (Cone de 60°: ±30° a partir da frente da cabeça/focinho)
        const currentHeadHeading = (baseHeading || 0) + (torsoYaw || 0);
        let fovDelta = targetAimAngle - currentHeadHeading;
        fovDelta = Math.atan2(Math.sin(fovDelta), Math.cos(fovDelta));
        const isWithinFOV = Math.abs(fovDelta) <= THREE.MathUtils.degToRad(30.0);

        // 2. Posição mundial do focinho/canhão
        const snoutPos = this.tempSnout.set(0, 0.4, 0.6).applyMatrix4(bodyGroup.matrixWorld);

        this.laserRayDir.subVectors(aimWorldPoint, snoutPos);
        const totalLaserDist = this.laserRayDir.length();
        let contactPoint = aimWorldPoint;
        let contactNormal = aimWorldNormal;
        let isLineOfSightBlocked = false;

        let hitTargetMesh = null;

        // 3. Teste Físico de Colisão do Raio Laser (Disparo Livre / Físico)
        if (totalLaserDist > 0.05) {
            this.laserRayDir.normalize();
            this.laserRaycaster.set(snoutPos, this.laserRayDir);
            this.laserRaycaster.far = Math.max(totalLaserDist + 20.0, 150.0);

            // Testar primeiro objeto interceptado pelo raio (inimigo, cabine, pilar ou bloco)
            const obstacleHits = this.laserRaycaster.intersectObjects(aimTargetableMeshes, false);
            if (obstacleHits.length > 0) {
                contactPoint = obstacleHits[0].point;
                hitTargetMesh = obstacleHits[0].object;
                if (obstacleHits[0].face) {
                    this.tempLaserHitNormal.copy(obstacleHits[0].face.normal)
                        .transformDirection(obstacleHits[0].object.matrixWorld)
                        .normalize();
                    contactNormal = this.tempLaserHitNormal;
                } else {
                    contactNormal = this.upVec;
                }
            } else {
                // Sem malhas no caminho: atinge diretamente o ponto do terreno mirado
                contactPoint = aimWorldPoint;
                contactNormal = aimWorldNormal;
            }

            // Testar se o feixe mergulha em alguma duna de areia antes do ponto de impacto
            const rayContactDist = snoutPos.distanceTo(contactPoint);
            const sampleSteps = 12;
            for (let i = 1; i < sampleSteps; i++) {
                const t = (i / sampleSteps);
                const sampleDist = rayContactDist * t;
                const sx = snoutPos.x + this.laserRayDir.x * sampleDist;
                const sz = snoutPos.z + this.laserRayDir.z * sampleDist;
                const sy = snoutPos.y + this.laserRayDir.y * sampleDist;
                const sandH = getBaseGroundMeshHeightFn ? getBaseGroundMeshHeightFn(sx, sz) : 0;
                if (sy < sandH - 0.15) {
                    contactPoint = this.sandContactPoint.set(sx, sandH, sz);
                    contactNormal = this.upVec;
                    hitTargetMesh = null;
                    break;
                }
            }
        }

        // O laser sempre dispara se estiver dentro do FOV de 60° (sem travas artificiais de gatilho)
        const canFire = isWithinFOV;
        this.isActuallyFiring = isAimFiring && canFire;

        // 4. Projeção Dinâmica do Recuo do Corpo (Fast-in, Easy-out em 500ms)
        if (this.isActuallyFiring) {
            this.shootingShiftZ = THREE.MathUtils.damp(this.shootingShiftZ, 1.50, 24.0, dt);
            this.wasLaserShootingShift = true;
        } else {
            if (this.wasLaserShootingShift) {
                this.shootingReleaseTime = elapsedTime;
                this.wasLaserShootingShift = false;
            }
            const timeSinceRelease = elapsedTime - this.shootingReleaseTime;
            if (timeSinceRelease < 0.50) {
                const t = THREE.MathUtils.clamp(timeSinceRelease / 0.50, 0.0, 1.0);
                this.shootingShiftZ = 1.5 * (1.0 - t) * (1.0 - t);
            } else {
                this.shootingShiftZ = 0.0;
            }
        }

        // 5. Atualização Gráfica do Feixe de Plasma
        this.laserBeamVec.subVectors(contactPoint, snoutPos);
        const actualDist = Math.max(this.laserBeamVec.length(), 0.01);
        this.laserBeamMid.addVectors(snoutPos, contactPoint).multiplyScalar(0.5);
        this.laserBeamDir.copy(this.laserBeamVec).normalize();
        this.laserBeamQuat.setFromUnitVectors(this.upVec, this.laserBeamDir);

        const laserPosAttr = this.laserLine.geometry.attributes.position;
        laserPosAttr.setXYZ(0, snoutPos.x, snoutPos.y, snoutPos.z);
        laserPosAttr.setXYZ(1, contactPoint.x, contactPoint.y, contactPoint.z);
        laserPosAttr.needsUpdate = true;

        const pulse1 = Math.sin(elapsedTime * 42.0);
        const pulse2 = Math.cos(elapsedTime * 75.0);
        const pulse3 = Math.sin(elapsedTime * 110.0);
        const pulseHarmonic = (pulse1 * 0.5 + pulse2 * 0.35 + pulse3 * 0.15);
        const superchargeScale = isSupercharged ? 1.45 : 1.0;

        if (this.isActuallyFiring) {
            // DISPARO ATIVO
            const coreRadius = (0.065 + pulseHarmonic * 0.022) * superchargeScale;
            const glowRadius = (0.220 + pulseHarmonic * 0.070) * superchargeScale;

            this.laserCoreMat.opacity = THREE.MathUtils.damp(this.laserCoreMat.opacity, 0.96 + pulse1 * 0.04, 30.0, dt);
            this.laserGlowMat.opacity = THREE.MathUtils.damp(this.laserGlowMat.opacity, 0.88 + pulse2 * 0.10, 30.0, dt);

            this.laserCoreMesh.visible = true;
            this.laserGlowMesh.visible = true;
            this.laserMuzzleFlare.visible = true;

            this.laserCoreMesh.position.copy(this.laserBeamMid);
            this.laserCoreMesh.quaternion.copy(this.laserBeamQuat);
            this.laserCoreMesh.scale.set(coreRadius, actualDist, coreRadius);

            this.laserGlowMesh.position.copy(this.laserBeamMid);
            this.laserGlowMesh.quaternion.copy(this.laserBeamQuat);
            this.laserGlowMesh.scale.set(glowRadius, actualDist, glowRadius);

            this.laserMuzzleFlare.position.copy(snoutPos);
            const muzzleScale = (1.0 + pulseHarmonic * 0.35) * superchargeScale;
            this.laserMuzzleFlare.scale.set(muzzleScale, muzzleScale, muzzleScale);
            this.muzzleFlareMat.opacity = 0.90 + pulse1 * 0.10;

            this.laserMat.opacity = 0.95;
            this.laserMat.color.setHex(0xffffff);

            this.snoutMuzzleLight.intensity = THREE.MathUtils.damp(this.snoutMuzzleLight.intensity, (18.0 + pulseHarmonic * 8.0) * superchargeScale, 32.0, dt);
            this.snoutMuzzleLight.position.copy(snoutPos);
        } else {
            // MODO MIRA PASSIVO OU DISPARO BLOQUEADO
            this.laserCoreMat.opacity = THREE.MathUtils.damp(this.laserCoreMat.opacity, 0.0, 24.0, dt);
            this.laserGlowMat.opacity = THREE.MathUtils.damp(this.laserGlowMat.opacity, 0.0, 24.0, dt);

            this.laserCoreMesh.visible = false;
            this.laserGlowMesh.visible = false;
            this.laserMuzzleFlare.visible = false;
            this.muzzleFlareMat.opacity = 0.0;

            // Linha Guia com Codificação de Cores Táticas
            if (!isWithinFOV) {
                this.laserMat.opacity = 0.40;
                this.laserMat.color.setHex(0xf59e0b); // Âmbar: Fora do FOV (robô pivoteando)
            } else {
                this.laserMat.opacity = 0.40;
                this.laserMat.color.setHex(0x38bdf8); // Ciano: Pronto / Liberado
            }

            this.snoutMuzzleLight.intensity = THREE.MathUtils.damp(this.snoutMuzzleLight.intensity, 0.0, 24.0, dt);
        }

        // Lâmpada de Impacto e Ponto Visual (Iluminação Dinâmica de Solda a Plasma)
        const targetLightIntensity = this.isActuallyFiring ? ((68.0 + pulseHarmonic * 26.0) * superchargeScale) : 0.0;
        this.aimTargetLight.intensity = THREE.MathUtils.damp(this.aimTargetLight.intensity, targetLightIntensity, 32.0, dt);
        this.aimTargetLight.position.copy(contactPoint).addScaledVector(contactNormal, 0.50);

        const targetImpactOpacity = this.isActuallyFiring ? (0.95 + pulse1 * 0.05) : 0.0;
        this.aimImpactMat.opacity = THREE.MathUtils.damp(this.aimImpactMat.opacity, targetImpactOpacity, 24.0, dt);
        this.aimCenterDotMat.opacity = THREE.MathUtils.damp(this.aimCenterDotMat.opacity, targetImpactOpacity, 24.0, dt);

        this.aimImpactRing.position.copy(contactPoint).addScaledVector(contactNormal, 0.03);
        this.aimImpactRing.quaternion.setFromUnitVectors(this.upVec, contactNormal);
        const ringScale = this.isActuallyFiring ? ((1.30 + pulseHarmonic * 0.28) * superchargeScale) : 1.0;
        this.aimImpactRing.scale.set(ringScale, ringScale, ringScale);

        this.aimCenterDot.position.copy(contactPoint).addScaledVector(contactNormal, 0.06);
        this.aimCenterDot.scale.set(ringScale, ringScale, ringScale);

        // 6. Corona e Aura Volumétrica de Plasma no Ponto de Impacto (Multi-Layer Plasma Glow)
        if (this.isActuallyFiring) {
            // [AJUSTE DE GLOW 1] — Clarão Central Incandescente (Tamanho ~1.4m a 1.9m)
            this.tipCoronaSprite.visible = true;
            this.tipCoronaSprite.position.copy(contactPoint).addScaledVector(contactNormal, 0.16);
            const coronaScale = (1.90 + pulseHarmonic * 0.35 + Math.random() * 0.20) * superchargeScale;
            this.tipCoronaSprite.scale.set(coronaScale, coronaScale, coronaScale);
            this.tipCoronaMat.opacity = 0.95 + pulse1 * 0.05;
            this.tipCoronaSprite.material.rotation = elapsedTime * 1.6;

            // [AJUSTE DE GLOW 2] — Aura Volumétrica de Plasma Bloom (Tamanho ~3.0m a 4.0m)
            this.tipBloomSprite.visible = true;
            this.tipBloomSprite.position.copy(contactPoint).addScaledVector(contactNormal, 0.22);
            const bloomScale = (4.00 + pulseHarmonic * 0.70 + Math.random() * 0.30) * superchargeScale;
            this.tipBloomSprite.scale.set(bloomScale, bloomScale, bloomScale);
            this.tipBloomMat.opacity = 0.58 + pulse2 * 0.12;
            this.tipBloomSprite.material.rotation = elapsedTime * -0.8;
        } else {
            this.tipCoronaSprite.visible = false;
            this.tipCoronaMat.opacity = 0.0;
            this.tipBloomSprite.visible = false;
            this.tipBloomMat.opacity = 0.0;
        }

        // 7. Rastreamento da Velocidade do Emissor para Rastro Dinâmico (Pointer Path Trail)
        if (this.isActuallyFiring) {
            if (this.hasPrevContact) {
                const stepDt = Math.max(dt, 0.001);
                this.emitterVelocity.subVectors(contactPoint, this.prevContactPoint).divideScalar(stepDt);
                if (this.emitterVelocity.length() > 50.0) {
                    this.emitterVelocity.normalize().multiplyScalar(50.0);
                }
            } else {
                this.emitterVelocity.set(0, 0, 0);
                this.hasPrevContact = true;
            }
            this.prevContactPoint.copy(contactPoint);
        } else {
            this.hasPrevContact = false;
            this.emitterVelocity.set(0, 0, 0);
        }

        // 8. Emissão de Brasas e Faíscas de Solda em Arco (Welding Sparks Fountain)
        if (this.isActuallyFiring) {
            const spawnRate = isSupercharged ? 320 : 220;
            const maxSparksPerFrame = isSupercharged ? 14 : 9;
            const sparksToSpawn = Math.min(Math.floor(dt * spawnRate) + (Math.random() < 0.7 ? 1 : 0), maxSparksPerFrame);
            let spawned = 0;
            for (let i = 0; i < this.maxSparks && spawned < sparksToSpawn; i++) {
                const s = this.sparks[i];
                if (!s.active) {
                    s.active = true;
                    s.life = 0.0;
                    s.maxLife = THREE.MathUtils.randFloat(0.38, 0.82);

                    // =========================================================================
                    // 🔧 [AJUSTE 1: TAMANHO INICIAL DAS BRASAS AO NASCER]
                    // Altere aqui os limites mínimo e máximo do diâmetro inicial:
                    // =========================================================================
                    s.baseSize = THREE.MathUtils.randFloat(0.2, 0.7);
                    s.bounceCount = 0;

                    // Ponto de emissão: no ponto de contato com micro-offset na direção da normal
                    s.pos.copy(contactPoint)
                        .addScaledVector(contactNormal, 0.05)
                        .add(new THREE.Vector3(
                            (Math.random() - 0.5) * 0.08,
                            (Math.random() - 0.5) * 0.08,
                            (Math.random() - 0.5) * 0.08
                        ));

                    // Direção da fonte em arco parabólico (Fountain arc)
                    const randX = (Math.random() - 0.5) * 1.6;
                    const randY = Math.random() * 0.95;
                    const randZ = (Math.random() - 0.5) * 1.6;

                    const fountainDir = new THREE.Vector3()
                        .copy(contactNormal).multiplyScalar(0.42)
                        .addScaledVector(this.upVec, 0.68)
                        .add(new THREE.Vector3(randX, randY, randZ))
                        .normalize();

                    const launchSpeed = THREE.MathUtils.randFloat(5.0, 15.5);
                    s.vel.copy(fountainDir).multiplyScalar(launchSpeed);

                    // Herança de inércia do movimento do emissor (laser path trail)
                    s.vel.addScaledVector(this.emitterVelocity, 0.20);

                    spawned++;
                }
            }
        }

        // 9. Atualização Física e Evolução Térmica das Partículas de Solda
        const sparkPosAttr = this.sparkGeo.attributes.position;
        const sparkColAttr = this.sparkGeo.attributes.color;
        const sparkSizeAttr = this.sparkGeo.attributes.size;

        const gravity = 19.5; // Gravidade dos arcos
        for (let i = 0; i < this.maxSparks; i++) {
            const s = this.sparks[i];
            if (s.active) {
                s.life += dt;
                if (s.life >= s.maxLife) {
                    s.active = false;
                    this.sparkPositions[i * 3 + 1] = -999.0;
                    this.sparkSizes[i] = 0.0;
                    continue;
                }

                // Física: Gravidade + Arrasto Aerodinâmico
                s.vel.y -= gravity * dt;
                s.vel.x *= Math.max(0.0, 1.0 - 0.95 * dt);
                s.vel.z *= Math.max(0.0, 1.0 - 0.95 * dt);

                s.pos.addScaledVector(s.vel, dt);

                // Colisão com o solo / dunas e quique
                const groundH = getBaseGroundMeshHeightFn ? getBaseGroundMeshHeightFn(s.pos.x, s.pos.z) : 0;
                if (s.pos.y <= groundH + 0.03 && s.vel.y < 0.0) {
                    s.pos.y = groundH + 0.03;
                    s.vel.y = -s.vel.y * 0.36; // Coeficiente de restituição elástica
                    s.vel.x *= 0.58;           // Desaceleração / atrito de solo
                    s.vel.z *= 0.58;
                    s.bounceCount++;
                }

                // Evolução Térmica das Cores (Super-quente Branco/Ciano -> Ciano Neon -> Azul Cobalto -> Fade)
                const progress = s.life / s.maxLife; // 0.0 (nascimento) a 1.0 (morte)
                let r = 1.0, g = 1.0, b = 1.0;

                if (progress < 0.18) {
                    // Estado Incandescente Quente (Branco / Ciano Claro)
                    const t = progress / 0.18;
                    r = THREE.MathUtils.lerp(1.00, 0.45, t);
                    g = THREE.MathUtils.lerp(1.00, 0.96, t);
                    b = 1.0;
                } else if (progress < 0.55) {
                    // Estado Ciano Neon / Elétrico
                    const t = (progress - 0.18) / 0.37;
                    r = THREE.MathUtils.lerp(0.45, 0.02, t);
                    g = THREE.MathUtils.lerp(0.96, 0.65, t);
                    b = 1.0;
                } else {
                    // Estado Brasa Azul Cobalto / Esfriando
                    const t = (progress - 0.55) / 0.45;
                    const fade = Math.pow(1.0 - t, 1.3);
                    r = 0.0;
                    g = THREE.MathUtils.lerp(0.65, 0.12, t) * fade;
                    b = THREE.MathUtils.lerp(1.00, 0.75, t) * fade;
                }

                this.sparkPositions[i * 3 + 0] = s.pos.x;
                this.sparkPositions[i * 3 + 1] = s.pos.y;
                this.sparkPositions[i * 3 + 2] = s.pos.z;

                this.sparkColors[i * 3 + 0] = r;
                this.sparkColors[i * 3 + 1] = g;
                this.sparkColors[i * 3 + 2] = b;

                // =========================================================================
                // 🔧 [AJUSTE 2: DECAIMENTO / ENCOLHIMENTO DO TAMANHO DURANTE O AGE]
                // progress: 0.0 (recém-nascida) até 1.0 (fim da vida).
                // shrinkFactor: (1.0 - progress * 0.78) encolhe a partícula em até 78% ao longo do tempo.
                // =========================================================================
                const shrinkFactor = Math.max(0.12, 1.0 - progress * 0.95);
                const sparkSize = s.baseSize * shrinkFactor * (0.88 + Math.random() * 0.24);
                this.sparkSizes[i] = sparkSize;
            } else {
                this.sparkPositions[i * 3 + 1] = -999.0;
                this.sparkSizes[i] = 0.0;
            }
        }

        sparkPosAttr.needsUpdate = true;
        sparkColAttr.needsUpdate = true;
        sparkSizeAttr.needsUpdate = true;

        // 10. Atualizar Retículo HUD no DOM
        if (this.crosshairRingElem) {
            if (this.isActuallyFiring) {
                this.crosshairRingElem.style.borderColor = '#00f0ff';
                this.crosshairRingElem.style.boxShadow = '0 0 20px #00f0ff, inset 0 0 10px #00f0ff';
                this.crosshairRingElem.style.transform = `scale(${1.2 + pulseHarmonic * 0.08})`;
            } else if (!isWithinFOV) {
                this.crosshairRingElem.style.borderColor = '#f59e0b';
                this.crosshairRingElem.style.boxShadow = '0 0 12px rgba(245, 158, 11, 0.7), inset 0 0 5px rgba(245, 158, 11, 0.4)';
                this.crosshairRingElem.style.transform = 'scale(1.0)';
            } else {
                this.crosshairRingElem.style.borderColor = '#38bdf8';
                this.crosshairRingElem.style.boxShadow = '0 0 10px rgba(56, 189, 248, 0.5)';
                this.crosshairRingElem.style.transform = 'scale(1.0)';
            }
        }

        return {
            isActuallyFiring: this.isActuallyFiring,
            shootingShiftZ: this.shootingShiftZ,
            hitObject: this.isActuallyFiring ? hitTargetMesh : null,
            contactPoint,
            contactNormal,
            snoutPos: this.tempSnout
        };
    }
}
