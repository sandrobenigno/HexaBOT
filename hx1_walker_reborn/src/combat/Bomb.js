/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — BOMB.JS
 * Mina / Bomba com Temporizador de 3 Segundos e Detonação em Área (Otimizada)
 * ============================================================================
 * - Zero alocações dinâmicas de PointLight (sem recomputação de shaders no Three.js)
 * - Geometrias e materiais reutilizáveis
 * - Efeitos visuais em Additive Blending de altíssima performance
 */

import * as THREE from 'three';

// Geometrias e Materiais compartilhados para evitar GC e shader recompile
const SHARED_BODY_GEO = new THREE.CylinderGeometry(0.28, 0.35, 0.22, 16);
const SHARED_CORE_GEO = new THREE.SphereGeometry(0.18, 16, 16);
const SHARED_EXP_GEO = new THREE.SphereGeometry(1.0, 20, 20);
const SHARED_RING_GEO = new THREE.RingGeometry(0.2, 1.0, 24);
SHARED_RING_GEO.rotateX(-Math.PI / 2);

const SHARED_BODY_MAT = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.35,
    metalness: 0.85
});

export class Bomb {
    /**
     * @param {THREE.Scene} scene Cena Three.js
     * @param {import('../core/EventBus.js').EventBus} eventBus Barramento de eventos
     * @param {THREE.Vector3} position Posição inicial no solo
     * @param {import('./EnemyManager.js').EnemyManager} enemyManager
     */
    constructor(scene, eventBus, position, enemyManager = null) {
        this.scene = scene;
        this.eventBus = eventBus;
        this.enemyManager = enemyManager;

        this.position = position.clone();
        this.fuseTime = 3.0;
        this.timer = this.fuseTime;
        this.isDetonated = false;
        this.isFinished = false;

        this.explosionRadius = 4.5;
        this.damageAmount = 50;

        this.explosionProgress = 0.0;
        this.explosionDuration = 0.40;

        // Construir malha visual da bomba
        this.group = new THREE.Group();
        this.group.position.copy(this.position);
        this.scene.add(this.group);

        this.buildBombMesh();
    }

    /**
     * Cria a geometria da bomba usando geometrias compartilhadas.
     */
    buildBombMesh() {
        // Base / cápsula metálica
        this.bodyMesh = new THREE.Mesh(SHARED_BODY_GEO, SHARED_BODY_MAT);
        this.bodyMesh.position.y = 0.11;
        this.group.add(this.bodyMesh);

        // Núcleo luminoso pulsante (LED de contagem regressiva)
        this.coreMat = new THREE.MeshBasicMaterial({
            color: 0xff0022,
            transparent: true,
            opacity: 0.95
        });
        this.coreMesh = new THREE.Mesh(SHARED_CORE_GEO, this.coreMat);
        this.coreMesh.position.y = 0.24;
        this.group.add(this.coreMesh);

        // Esfera de choque para a explosão (inicialmente oculta)
        this.expMat = new THREE.MeshBasicMaterial({
            color: 0xff4400,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.expMesh = new THREE.Mesh(SHARED_EXP_GEO, this.expMat);
        this.expMesh.position.y = 0.4;
        this.expMesh.visible = false;
        this.group.add(this.expMesh);

        // Anel no solo
        this.ringMat = new THREE.MeshBasicMaterial({
            color: 0xff2200,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        this.ringMesh = new THREE.Mesh(SHARED_RING_GEO, this.ringMat);
        this.ringMesh.position.y = 0.05;
        this.ringMesh.visible = false;
        this.group.add(this.ringMesh);
    }

    /**
     * Atualiza a contagem regressiva e efeitos visuais.
     * @param {number} dt Delta time em segundos
     * @param {THREE.Vector3} hxPosition Posição central do HexaBOT
     * @param {Array<import('./LadybugEnemy.js').LadybugEnemy>} enemies Lista de inimigos ativos
     */
    update(dt, hxPosition, enemies) {
        if (this.isFinished) return;

        if (!this.isDetonated) {
            this.timer -= dt;

            // Frequência de pulso visual acelerando
            const normalizedRemaining = Math.max(0.0, this.timer / this.fuseTime);
            const pulseSpeed = THREE.MathUtils.lerp(35.0, 6.0, normalizedRemaining);
            const pulse = (Math.sin(performance.now() * 0.001 * pulseSpeed) + 1.0) * 0.5;

            // Transição de cor (Amarelo/Laranja -> Vermelho Intenso)
            const flashColor = pulse > 0.4 ? 0xff0022 : 0xffbb00;
            this.coreMat.color.setHex(flashColor);

            const scale = 1.0 + pulse * 0.35;
            this.coreMesh.scale.set(scale, scale, scale);

            if (this.timer <= 0) {
                this.detonate(hxPosition, enemies);
            }
        } else {
            // Animação da explosão
            this.explosionProgress += dt / this.explosionDuration;
            const progress = THREE.MathUtils.clamp(this.explosionProgress, 0.0, 1.0);

            // Expansão da esfera de choque
            const currentRadius = this.explosionRadius * Math.sin(progress * Math.PI * 0.5);
            this.expMesh.scale.set(currentRadius, currentRadius, currentRadius);
            this.expMat.opacity = Math.pow(1.0 - progress, 1.5) * 0.95;

            const ringRadius = this.explosionRadius * 1.3 * Math.sin(progress * Math.PI * 0.5);
            this.ringMesh.scale.set(ringRadius, ringRadius, ringRadius);
            this.ringMat.opacity = (1.0 - progress) * 0.8;

            if (this.explosionProgress >= 1.0) {
                this.dispose();
                this.isFinished = true;
            }
        }
    }

    /**
     * Detona a bomba, aplicando dano ao HX e a inimigos no raio de alcance.
     * @param {THREE.Vector3} hxPosition Posição do HexaBOT
     * @param {Array<import('./LadybugEnemy.js').LadybugEnemy>} enemies Lista de inimigos
     */
    detonate(hxPosition, enemies) {
        this.isDetonated = true;

        // Ocultar corpo da bomba e ativar esfera e anel de choque
        this.bodyMesh.visible = false;
        this.coreMesh.visible = false;
        this.expMesh.visible = true;
        this.ringMesh.visible = true;

        // Disparar flash na luz estática compartilhada do EnemyManager
        if (this.enemyManager && typeof this.enemyManager.triggerExplosionFlash === 'function') {
            this.enemyManager.triggerExplosionFlash(this.position);
        }

        // Disparar efeito sonoro 3D espacial da explosão ("Booom!")
        this.eventBus.emit('sound:bombExplosion', this.position.clone());

        // 1. Verificar dano no HexaBOT
        if (hxPosition) {
            const dx = this.position.x - hxPosition.x;
            const dz = this.position.z - hxPosition.z;
            const distToHx = Math.sqrt(dx * dx + dz * dz);
            if (distToHx <= this.explosionRadius + 1.2) {
                this.eventBus.emit('bot:triggerDamage', 200);
            }
        }

        // 2. Verificar dano em outras joaninhas no raio
        if (enemies && enemies.length > 0) {
            enemies.forEach((enemy) => {
                if (enemy && !enemy.isDead) {
                    const dx = this.position.x - enemy.position.x;
                    const dz = this.position.z - enemy.position.z;
                    const distToEnemy = Math.sqrt(dx * dx + dz * dz);
                    if (distToEnemy <= this.explosionRadius) {
                        enemy.takeDamage(this.damageAmount);
                    }
                }
            });
        }
    }

    /**
     * Libera recursos Three.js da cena.
     */
    dispose() {
        if (this.group && this.group.parent) {
            this.group.parent.remove(this.group);
        }
        if (this.coreMat) this.coreMat.dispose();
        if (this.expMat) this.expMat.dispose();
        if (this.ringMat) this.ringMat.dispose();
    }
}
