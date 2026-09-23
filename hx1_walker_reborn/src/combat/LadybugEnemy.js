/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — LADYBUGENEMY.JS
 * Inimigo Joaninha Procedural (Esfera Metálica Vermelha de 1m) — Otimizada
 * ============================================================================
 * - Geometrias e materiais compartilhados
 * - Zero alocações dinâmicas de PointLight
 * - Altíssima performance e estabilidade de FPS
 */

import * as THREE from 'three';

// Geometrias e Materiais compartilhados (Escala de 2m de diâmetro / raio 1.0m)
const SHARED_SPHERE_GEO = new THREE.SphereGeometry(1.0, 24, 24);
const SHARED_SEAM_GEO = new THREE.CylinderGeometry(1.008, 1.008, 0.05, 24);
SHARED_SEAM_GEO.rotateX(Math.PI / 2);
const SHARED_EYE_GEO = new THREE.SphereGeometry(0.15, 12, 12);

const SHARED_SEAM_MAT = new THREE.MeshStandardMaterial({
    color: 0x0a0e17,
    metalness: 0.90,
    roughness: 0.40
});

const SHARED_EYE_MAT = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

export class LadybugEnemy {
    /**
     * @param {THREE.Scene} scene Cena Three.js
     * @param {import('../core/EventBus.js').EventBus} eventBus Barramento de eventos
     * @param {THREE.Vector3} spawnPosition Posição inicial no mundo
     * @param {THREE.Vector3} [initialHeading] Direção inicial de saída da porta
     */
    constructor(scene, eventBus, spawnPosition, initialHeading = null) {
        this.scene = scene;
        this.eventBus = eventBus;

        this.position = spawnPosition.clone();
        this.heading = initialHeading ? Math.atan2(initialHeading.x, initialHeading.z) : 0.0;
        this.speed = 5.8;
        this.radius = 1.0; // Raio 1.0m -> Esfera de 2.0m de diâmetro

        // Estados: 'SPAWNING', 'HUNTING', 'PLANTING', 'RETREATING', 'DEAD'
        this.state = 'SPAWNING';
        this.stateTimer = 0.8;
        this.spawnDirection = initialHeading ? initialHeading.clone().normalize() : new THREE.Vector3(0, 0, 1);

        // Combate e Vida
        this.maxHp = 80;
        this.hp = this.maxHp;
        this.isDead = false;
        this.isFinished = false;
        this.hitFlashTimer = 0.0;

        // Controle de Bombas
        this.hasBombReady = true;
        this.bombCooldown = 0.0;

        // Efeito de Morte / Destruição
        this.deathProgress = 0.0;
        this.deathDuration = 0.35;

        // Construir hierarquia 3D
        this.group = new THREE.Group();
        this.group.position.copy(this.position);
        this.scene.add(this.group);

        this.buildMesh();
    }

    /**
     * Cria a geometria da joaninha usando geometrias compartilhadas.
     */
    buildMesh() {
        // Carapaça Vermelha Metálica
        this.bodyMat = new THREE.MeshStandardMaterial({
            color: 0xd80020,
            metalness: 0.88,
            roughness: 0.22,
            envMapIntensity: 0.90
        });

        this.targetMesh = new THREE.Mesh(SHARED_SPHERE_GEO, this.bodyMat);
        this.targetMesh.castShadow = true;
        this.targetMesh.receiveShadow = true;
        this.targetMesh.userData = { entity: this, type: 'enemy' };
        this.group.add(this.targetMesh);

        // Detalhe central
        const seamMesh = new THREE.Mesh(SHARED_SEAM_GEO, SHARED_SEAM_MAT);
        this.group.add(seamMesh);

        // Olhos sensores ciano proporcionais
        const leftEye = new THREE.Mesh(SHARED_EYE_GEO, SHARED_EYE_MAT);
        leftEye.position.set(-0.36, 0.24, 0.84);
        this.group.add(leftEye);

        const rightEye = new THREE.Mesh(SHARED_EYE_GEO, SHARED_EYE_MAT);
        rightEye.position.set(0.36, 0.24, 0.84);
        this.group.add(rightEye);
    }

    /**
     * Aplica dano ao inimigo.
     * @param {number} damage Quantidade de dano sofrido
     */
    takeDamage(damage) {
        if (this.isDead) return;

        this.hp -= damage;
        this.hitFlashTimer = 0.08;

        if (this.hp <= 0) {
            this.hp = 0;
            this.die();
        }
    }

    /**
     * Inicia o processo de destruição.
     */
    die() {
        this.isDead = true;
        this.state = 'DEAD';
        this.bodyMat.color.setHex(0xffaa00);
        this.bodyMat.emissive.setHex(0xff6600);
        this.bodyMat.emissiveIntensity = 1.0;
    }

    /**
     * Atualiza a lógica de IA, movimento e colisão com terreno.
     * @param {number} dt Delta time em segundos
     * @param {THREE.Vector3} hxPosition Posição central do HexaBOT
     * @param {import('../world/TerrainArena.js').TerrainArena} terrainArena
     * @returns {{ shouldDropBomb: boolean, dropPosition: THREE.Vector3 }}
     */
    update(dt, hxPosition, terrainArena) {
        let shouldDropBomb = false;
        let dropPosition = null;

        if (this.isDead) {
            this.deathProgress += dt / this.deathDuration;
            const p = THREE.MathUtils.clamp(this.deathProgress, 0.0, 1.0);

            const s = (1.0 + p * 0.3) * (1.0 - p);
            this.group.scale.set(s, s, s);

            if (this.deathProgress >= 1.0) {
                this.dispose();
                this.isFinished = true;
            }
            return { shouldDropBomb: false, dropPosition: null };
        }

        // Flash de dano em emissivo (zero impacto no renderer)
        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= dt;
            this.bodyMat.color.setHex(0xffffff);
            this.bodyMat.emissive.setHex(0xff4422);
            this.bodyMat.emissiveIntensity = 0.8;
        } else {
            this.bodyMat.color.setHex(0xd80020);
            this.bodyMat.emissive.setHex(0x000000);
            this.bodyMat.emissiveIntensity = 0.0;
        }

        // Recarga de bomba
        if (!this.hasBombReady) {
            this.bombCooldown -= dt;
            if (this.bombCooldown <= 0) {
                this.hasBombReady = true;
            }
        }

        // Distância rápida até o HexaBOT
        const dirX = hxPosition.x - this.position.x;
        const dirZ = hxPosition.z - this.position.z;
        const distToHx = Math.sqrt(dirX * dirX + dirZ * dirZ);

        // --- MÁQUINA DE ESTADOS DA IA ---
        if (this.state === 'SPAWNING') {
            this.stateTimer -= dt;
            this.position.x += this.spawnDirection.x * this.speed * dt;
            this.position.z += this.spawnDirection.z * this.speed * dt;
            this.heading = Math.atan2(this.spawnDirection.x, this.spawnDirection.z);

            if (this.stateTimer <= 0) {
                this.state = 'HUNTING';
            }
        } else if (this.state === 'HUNTING') {
            const targetHeading = Math.atan2(dirX, dirZ);

            let diff = targetHeading - this.heading;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            this.heading += diff * Math.min(1.0, dt * 8.0);

            this.position.x += Math.sin(this.heading) * this.speed * dt;
            this.position.z += Math.cos(this.heading) * this.speed * dt;

            // Se chegou debaixo do chassi do HexaBOT (ajustado para bot de 2m)
            if (distToHx < 1.85 && this.hasBombReady) {
                this.state = 'PLANTING';
                this.stateTimer = 0.2;
            }
        } else if (this.state === 'PLANTING') {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                shouldDropBomb = true;
                dropPosition = this.position.clone();
                this.hasBombReady = false;
                this.bombCooldown = 5.0;

                this.state = 'RETREATING';
                this.stateTimer = 2.0;
            }
        } else if (this.state === 'RETREATING') {
            this.stateTimer -= dt;
            const escapeHeading = Math.atan2(-dirX, -dirZ);

            let diff = escapeHeading - this.heading;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            this.heading += diff * Math.min(1.0, dt * 6.0);

            this.position.x += Math.sin(this.heading) * (this.speed * 0.9) * dt;
            this.position.z += Math.cos(this.heading) * (this.speed * 0.9) * dt;

            if (this.stateTimer <= 0) {
                this.state = 'HUNTING';
            }
        }

        // Limites da Arena
        this.position.x = THREE.MathUtils.clamp(this.position.x, -125.0, 125.0);
        this.position.z = THREE.MathUtils.clamp(this.position.z, -125.0, 125.0);

        // Altura do terreno
        this.position.y = terrainArena.getTerrainHeight(this.position.x, this.position.z);

        this.group.position.copy(this.position);
        this.group.rotation.set(0, this.heading, 0);

        return { shouldDropBomb, dropPosition };
    }

    /**
     * Libera recursos Three.js da cena.
     */
    dispose() {
        if (this.group && this.group.parent) {
            this.group.parent.remove(this.group);
        }
        if (this.bodyMat) this.bodyMat.dispose();
    }
}
