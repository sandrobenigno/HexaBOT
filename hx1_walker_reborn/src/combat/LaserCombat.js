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

        // Elemento DOM do Retículo
        this.crosshairRingElem = document.getElementById('crosshair-ring');

        // Construir malhas e luzes do sistema de combate
        this.buildLaserMeshes();
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
        const muzzleFlareGeo = new THREE.SphereGeometry(0.24, 16, 16);
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
        this.snoutMuzzleLight = new THREE.PointLight(0x00e5ff, 0.0, 10.0, 1.2);
        this.scene.add(this.snoutMuzzleLight);

        // Luz de Impacto na Superfície
        this.aimTargetLight = new THREE.PointLight(0x00e5ff, 0.0, 22.0, 0.8);
        this.aimTargetLight.position.set(0, 0.4, 0);
        this.scene.add(this.aimTargetLight);

        // Anel de Impacto Visual e Ponto Central no Solo / Paredes
        const aimImpactGeo = new THREE.RingGeometry(0.10, 0.55, 32);
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

        const aimCenterDotGeo = new THREE.SphereGeometry(0.12, 16, 16);
        this.aimCenterDotMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending
        });
        this.aimCenterDot = new THREE.Mesh(aimCenterDotGeo, this.aimCenterDotMat);
        this.scene.add(this.aimCenterDot);
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
     * @param {Array<THREE.Mesh>} params.aimTargetableMeshes Obstáculos sólidos para colisão do raio
     * @param {Function} params.getBaseGroundMeshHeightFn Função analítica de altitude da areia
     * @returns {{ isActuallyFiring: boolean, shootingShiftZ: number }}
     */
    update(dt, elapsedTime, {
        isAimFiring,
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

        // 3. Teste de Linha de Visada e Barreira do Relevo da Areia
        if (totalLaserDist > 0.05) {
            this.laserRayDir.normalize();
            this.laserRaycaster.set(snoutPos, this.laserRayDir);
            this.laserRaycaster.far = totalLaserDist;

            // Testar obstáculos sólidos
            const obstacleHits = this.laserRaycaster.intersectObjects(aimTargetableMeshes, false);
            if (obstacleHits.length > 0 && obstacleHits[0].distance < totalLaserDist - 0.20) {
                contactPoint = obstacleHits[0].point;
                if (obstacleHits[0].face) {
                    this.tempLaserHitNormal.copy(obstacleHits[0].face.normal)
                        .transformDirection(obstacleHits[0].object.matrixWorld)
                        .normalize();
                    contactNormal = this.tempLaserHitNormal;
                } else {
                    contactNormal = this.upVec;
                }
                isLineOfSightBlocked = true;
            }

            // Verificação Analítica de Dunas de Areia ao longo da linha de tiro (12 amostragens)
            const sampleSteps = 12;
            const checkDist = isLineOfSightBlocked ? obstacleHits[0].distance : totalLaserDist;
            for (let i = 1; i < sampleSteps; i++) {
                const t = (i / sampleSteps);
                const sampleDist = checkDist * t;
                const sx = snoutPos.x + this.laserRayDir.x * sampleDist;
                const sz = snoutPos.z + this.laserRayDir.z * sampleDist;
                const sy = snoutPos.y + this.laserRayDir.y * sampleDist;
                const sandH = getBaseGroundMeshHeightFn(sx, sz);
                if (sy < sandH - 0.15) {
                    // O feixe mergulha dentro de uma duna de areia antes de atingir o alvo
                    contactPoint = new THREE.Vector3(sx, sandH, sz);
                    contactNormal = this.upVec;
                    isLineOfSightBlocked = true;
                    break;
                }
            }
        }

        const isLineOfSightClear = !isLineOfSightBlocked;
        const canFire = isWithinFOV && isLineOfSightClear;
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

        if (this.isActuallyFiring) {
            // DISPARO ATIVO
            const coreRadius = 0.065 + pulseHarmonic * 0.022;
            const glowRadius = 0.220 + pulseHarmonic * 0.070;

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
            const muzzleScale = 1.0 + pulseHarmonic * 0.35;
            this.laserMuzzleFlare.scale.set(muzzleScale, muzzleScale, muzzleScale);
            this.muzzleFlareMat.opacity = 0.90 + pulse1 * 0.10;

            this.laserMat.opacity = 0.95;
            this.laserMat.color.setHex(0xffffff);

            this.snoutMuzzleLight.intensity = THREE.MathUtils.damp(this.snoutMuzzleLight.intensity, 18.0 + pulseHarmonic * 8.0, 32.0, dt);
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
            if (!isLineOfSightClear) {
                this.laserMat.opacity = 0.45;
                this.laserMat.color.setHex(0xef4444); // Vermelho: Obstruído
            } else if (!isWithinFOV) {
                this.laserMat.opacity = 0.40;
                this.laserMat.color.setHex(0xf59e0b); // Âmbar: Fora do FOV
            } else {
                this.laserMat.opacity = 0.40;
                this.laserMat.color.setHex(0x38bdf8); // Ciano: Pronto / Liberado
            }

            this.snoutMuzzleLight.intensity = THREE.MathUtils.damp(this.snoutMuzzleLight.intensity, 0.0, 24.0, dt);
        }

        // Lâmpada de Impacto e Ponto Visual
        const targetLightIntensity = this.isActuallyFiring ? (44.0 + pulseHarmonic * 16.0) : 0.0;
        this.aimTargetLight.intensity = THREE.MathUtils.damp(this.aimTargetLight.intensity, targetLightIntensity, 32.0, dt);
        this.aimTargetLight.position.copy(contactPoint).addScaledVector(contactNormal, 0.45);

        const targetImpactOpacity = this.isActuallyFiring ? (0.92 + pulse1 * 0.08) : 0.0;
        this.aimImpactMat.opacity = THREE.MathUtils.damp(this.aimImpactMat.opacity, targetImpactOpacity, 24.0, dt);
        this.aimCenterDotMat.opacity = THREE.MathUtils.damp(this.aimCenterDotMat.opacity, targetImpactOpacity, 24.0, dt);

        this.aimImpactRing.position.copy(contactPoint).addScaledVector(contactNormal, 0.03);
        this.aimImpactRing.quaternion.setFromUnitVectors(this.upVec, contactNormal);
        const ringScale = this.isActuallyFiring ? (1.0 + pulseHarmonic * 0.22) : 1.0;
        this.aimImpactRing.scale.set(ringScale, ringScale, ringScale);

        this.aimCenterDot.position.copy(contactPoint).addScaledVector(contactNormal, 0.06);
        this.aimCenterDot.scale.set(ringScale, ringScale, ringScale);

        // 6. Atualizar Retículo HUD no DOM
        if (this.crosshairRingElem) {
            if (this.isActuallyFiring) {
                this.crosshairRingElem.style.borderColor = '#00f0ff';
                this.crosshairRingElem.style.boxShadow = '0 0 20px #00f0ff, inset 0 0 10px #00f0ff';
                this.crosshairRingElem.style.transform = `scale(${1.2 + pulseHarmonic * 0.08})`;
            } else if (!isLineOfSightClear) {
                this.crosshairRingElem.style.borderColor = '#ef4444';
                this.crosshairRingElem.style.boxShadow = '0 0 14px rgba(239, 68, 68, 0.8), inset 0 0 6px rgba(239, 68, 68, 0.5)';
                this.crosshairRingElem.style.transform = 'scale(0.95)';
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
            shootingShiftZ: this.shootingShiftZ
        };
    }
}
