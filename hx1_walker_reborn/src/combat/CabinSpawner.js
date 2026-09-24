/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — CABINSPAWNER.JS
 * Cabine Geradora / Spawner Cúbico com 4 Portas Laterais (Otimizada)
 * ============================================================================
 * - Geometrias e materiais compartilhados
 * - Zero PointLights dinâmicas
 * - Efeitos emissivos puros e leves
 */

import * as THREE from 'three';

const CABIN_WIDTH = 4.0;
const CABIN_HEIGHT = 3.2;
const CABIN_DEPTH = 4.0;

const SHARED_CABIN_GEO = new THREE.BoxGeometry(CABIN_WIDTH, CABIN_HEIGHT, CABIN_DEPTH);
const SHARED_EDGE_GEO = new THREE.EdgesGeometry(SHARED_CABIN_GEO);
const SHARED_DOOR_GEO = new THREE.PlaneGeometry(2.2, 2.2);
const SHARED_BEACON_GEO = new THREE.SphereGeometry(0.25, 12, 12);

const SHARED_EDGE_MAT = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85 });
const SHARED_DOOR_MAT = new THREE.MeshBasicMaterial({
    color: 0xff3300,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide
});

export class CabinSpawner {
    /**
     * @param {THREE.Scene} scene Cena Three.js
     * @param {import('../core/EventBus.js').EventBus} eventBus Barramento de eventos
     * @param {THREE.Vector3} position Posição da base no terreno
     * @param {number} [spawnInterval] Intervalo entre saídas de inimigos (segundos)
     */
    constructor(scene, eventBus, position, spawnInterval = 5.5) {
        this.scene = scene;
        this.eventBus = eventBus;

        this.position = position.clone();
        this.spawnInterval = spawnInterval;
        this.spawnTimer = 2.0;
        this.doorIndex = 0;

        this.width = CABIN_WIDTH;
        this.height = CABIN_HEIGHT;
        this.depth = CABIN_DEPTH;

        // Resistência Reforçada Dobrada (2100 HP)
        this.maxHp = 2100;
        this.hp = this.maxHp;
        this.isDestroyed = false;
        this.isFinished = false;
        this.hitFlashTimer = 0.0;
        this.glitchSoundCooldown = 0.0;

        this.destructionProgress = 0.0;
        this.destructionDuration = 0.50;

        this.doors = [
            { normal: new THREE.Vector3(0, 0, 1), offset: new THREE.Vector3(0, 0, this.depth * 0.5 + 1.35) },  // Sul (+Z)
            { normal: new THREE.Vector3(1, 0, 0), offset: new THREE.Vector3(this.width * 0.5 + 1.35, 0, 0) },  // Leste (+X)
            { normal: new THREE.Vector3(0, 0, -1), offset: new THREE.Vector3(0, 0, -this.depth * 0.5 - 1.35) }, // Norte (-Z)
            { normal: new THREE.Vector3(-1, 0, 0), offset: new THREE.Vector3(-this.width * 0.5 - 1.35, 0, 0) }  // Oeste (-X)
        ];

        this.group = new THREE.Group();
        this.group.position.set(this.position.x, this.position.y + this.height * 0.5, this.position.z);
        this.scene.add(this.group);

        this.buildCabinMesh();
        this.buildShieldHUD();
    }

    /**
     * Cria a malha da cabine cúbica.
     */
    buildCabinMesh() {
        // 1. Cubo Principal da Estrutura
        this.cabinMat = new THREE.MeshStandardMaterial({
            color: 0x1a2332,
            metalness: 0.82,
            roughness: 0.38,
            envMapIntensity: 0.8
        });

        this.targetMesh = new THREE.Mesh(SHARED_CABIN_GEO, this.cabinMat);
        this.targetMesh.castShadow = false; // Sombra exclusiva da HX
        this.targetMesh.receiveShadow = true;
        this.targetMesh.userData = { entity: this, type: 'cabin' };
        this.group.add(this.targetMesh);

        // 2. Arestas Neon Ciano
        const edgeLines = new THREE.LineSegments(SHARED_EDGE_GEO, SHARED_EDGE_MAT);
        this.group.add(edgeLines);

        // 3. Portas nas 4 faces laterais
        const doorSouth = new THREE.Mesh(SHARED_DOOR_GEO, SHARED_DOOR_MAT);
        doorSouth.position.set(0, -0.4, this.depth * 0.501);
        this.group.add(doorSouth);

        const doorNorth = new THREE.Mesh(SHARED_DOOR_GEO, SHARED_DOOR_MAT);
        doorNorth.position.set(0, -0.4, -this.depth * 0.501);
        doorNorth.rotation.y = Math.PI;
        this.group.add(doorNorth);

        const doorEast = new THREE.Mesh(SHARED_DOOR_GEO, SHARED_DOOR_MAT);
        doorEast.position.set(this.width * 0.501, -0.4, 0);
        doorEast.rotation.y = Math.PI / 2;
        this.group.add(doorEast);

        const doorWest = new THREE.Mesh(SHARED_DOOR_GEO, SHARED_DOOR_MAT);
        doorWest.position.set(-this.width * 0.501, -0.4, 0);
        doorWest.rotation.y = -Math.PI / 2;
        this.group.add(doorWest);

        // 4. Sinalizador Luminoso no Teto (Emissivo, sem PointLight)
        this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff0044 });
        this.beaconMesh = new THREE.Mesh(SHARED_BEACON_GEO, this.beaconMat);
        this.beaconMesh.position.set(0, this.height * 0.5 + 0.25, 0);
        this.group.add(this.beaconMesh);
    }

    /**
     * Constrói o Mostrador de Energia do Escudo Holográfico 3D (Billboard).
     */
    buildShieldHUD() {
        this.shieldCanvas = document.createElement('canvas');
        this.shieldCanvas.width = 512;
        this.shieldCanvas.height = 128;
        this.shieldCtx = this.shieldCanvas.getContext('2d');

        this.shieldTexture = new THREE.CanvasTexture(this.shieldCanvas);
        this.shieldTexture.minFilter = THREE.LinearFilter;

        this.shieldMat = new THREE.SpriteMaterial({
            map: this.shieldTexture,
            transparent: true,
            depthWrite: false
        });

        this.shieldSprite = new THREE.Sprite(this.shieldMat);
        this.shieldSprite.position.set(0, this.height * 0.5 + 1.50, 0);
        this.shieldSprite.scale.set(5.6, 1.4, 1.0);
        this.group.add(this.shieldSprite);

        this.updateShieldHUD();
    }

    /**
     * Renderiza dinamicamente a barra de energia do escudo com porcentagem (100% a 0%).
     */
    updateShieldHUD() {
        if (!this.shieldCtx) return;
        const ctx = this.shieldCtx;
        const w = 512, h = 128;
        const percent = Math.max(0, Math.min(100, (this.hp / this.maxHp) * 100));
        const pNorm = percent / 100.0;

        ctx.clearRect(0, 0, w, h);

        // 1. Painel Sci-Fi de Fundo com Cantos Chanfrados
        ctx.fillStyle = 'rgba(10, 16, 26, 0.84)';
        ctx.strokeStyle = percent < 30 ? '#ef4444' : (percent < 60 ? '#f59e0b' : '#00f0ff');
        ctx.lineWidth = 4;

        ctx.beginPath();
        ctx.moveTo(28, 16);
        ctx.lineTo(w - 28, 16);
        ctx.lineTo(w - 14, 30);
        ctx.lineTo(w - 14, h - 16);
        ctx.lineTo(28, h - 16);
        ctx.lineTo(14, h - 30);
        ctx.lineTo(14, 30);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 2. Título do Escudo e Valor em %
        ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = percent < 30 ? '#ff4d4d' : '#38bdf8';
        ctx.fillText('SHIELD ENERGY', 34, 46);

        ctx.textAlign = 'right';
        ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = percent < 30 ? '#ff0033' : (percent < 60 ? '#fbbf24' : '#00f0ff');
        ctx.fillText(`${Math.round(percent)}%`, w - 34, 46);

        // 3. Fundo do Slot da Barra
        const barX = 34, barY = 60, barW = w - 68, barH = 34;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(barX, barY, barW, barH);

        // 4. Preenchimento da Barra de Energia com Gradiente Dinâmico
        if (pNorm > 0) {
            const fillW = barW * pNorm;
            const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
            if (percent < 30) {
                grad.addColorStop(0, '#990011');
                grad.addColorStop(1, '#ff0033');
            } else if (percent < 60) {
                grad.addColorStop(0, '#d97706');
                grad.addColorStop(1, '#f59e0b');
            } else {
                grad.addColorStop(0, '#0284c7');
                grad.addColorStop(1, '#00f0ff');
            }
            ctx.fillStyle = grad;
            ctx.fillRect(barX, barY, fillW, barH);
        }

        // 5. Divisores Segmentados Táticos
        ctx.strokeStyle = 'rgba(10, 16, 26, 0.9)';
        ctx.lineWidth = 3;
        for (let i = 1; i < 10; i++) {
            const x = barX + (barW * (i / 10));
            ctx.beginPath();
            ctx.moveTo(x, barY);
            ctx.lineTo(x, barY + barH);
            ctx.stroke();
        }

        this.shieldTexture.needsUpdate = true;
    }

    /**
     * Aplica dano à cabine.
     * @param {number} damage
     */
    takeDamage(damage) {
        if (this.isDestroyed) return;

        this.hp -= damage;
        this.hitFlashTimer = 0.08;

        // Disparar efeito sonoro de Tilt / Glitch eletrônico com cadência confortável
        if (this.glitchSoundCooldown <= 0) {
            this.eventBus.emit('sound:glitch', this.position.clone());
            this.glitchSoundCooldown = 0.42; // Cooldown de 420ms para ritmo de sobrecarga
        }

        this.updateShieldHUD();

        if (this.hp <= 0) {
            this.hp = 0;
            this.destroy();
        }
    }

    /**
     * Inicia o colapso e destruição da cabine.
     */
    destroy() {
        this.isDestroyed = true;
        this.beaconMat.color.setHex(0xffaa00);
        this.updateShieldHUD();
        // Efeito sonoro terminal de destruição da cabine (glitch_2.mp3)
        this.eventBus.emit('sound:cabinDestroyed', this.position.clone());
    }

    /**
     * Atualiza o temporizador de spawn e efeitos visuais.
     * @param {number} dt Delta time em segundos
     * @param {number} activeEnemyCount Quantidade atual de joaninhas vivas
     * @param {number} maxAllowedEnemies Limite máximo de inimigos simultâneos
     * @returns {{ shouldSpawn: boolean, spawnPos: THREE.Vector3, spawnDir: THREE.Vector3 }}
     */
    update(dt, activeEnemyCount = 0, maxAllowedEnemies = 6) {
        // Reduzir cooldown do som de glitch
        if (this.glitchSoundCooldown > 0) {
            this.glitchSoundCooldown -= dt;
        }

        if (this.isDestroyed) {
            this.destructionProgress += dt / this.destructionDuration;
            const p = THREE.MathUtils.clamp(this.destructionProgress, 0.0, 1.0);

            const s = (1.0 - p);
            this.group.scale.set(1.0 + p * 0.3, s, 1.0 + p * 0.3);
            this.group.position.y = this.position.y + (this.height * 0.5) * (1.0 - p);

            if (this.shieldSprite) {
                this.shieldSprite.scale.set(5.6 * s, 1.4 * s, 1.0);
            }

            if (this.destructionProgress >= 1.0) {
                this.dispose();
                this.isFinished = true;
            }
            return { shouldSpawn: false, spawnPos: null, spawnDir: null };
        }

        // Flash de dano em emissivo
        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= dt;
            this.cabinMat.color.setHex(0xffffff);
            this.cabinMat.emissive.setHex(0xff4400);
            this.cabinMat.emissiveIntensity = 0.8;
        } else {
            this.cabinMat.color.setHex(0x1a2332);
            this.cabinMat.emissive.setHex(0x000000);
            this.cabinMat.emissiveIntensity = 0.0;
        }

        // Pulsar beacon do teto
        const pulse = (Math.sin(performance.now() * 0.005) + 1.0) * 0.5;
        const bScale = 1.0 + pulse * 0.3;
        this.beaconMesh.scale.set(bScale, bScale, bScale);

        // Temporizador de Spawn
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            this.spawnTimer = this.spawnInterval;

            if (activeEnemyCount < maxAllowedEnemies) {
                const door = this.doors[this.doorIndex];
                this.doorIndex = (this.doorIndex + 1) % this.doors.length;

                const spawnPos = new THREE.Vector3(
                    this.position.x + door.offset.x,
                    this.position.y,
                    this.position.z + door.offset.z
                );

                return {
                    shouldSpawn: true,
                    spawnPos,
                    spawnDir: door.normal.clone()
                };
            }
        }

        return { shouldSpawn: false, spawnPos: null, spawnDir: null };
    }

    /**
     * Libera recursos Three.js da cena.
     */
    dispose() {
        if (this.group && this.group.parent) {
            this.group.parent.remove(this.group);
        }
        if (this.cabinMat) this.cabinMat.dispose();
        if (this.beaconMat) this.beaconMat.dispose();
        if (this.shieldTexture) this.shieldTexture.dispose();
        if (this.shieldMat) this.shieldMat.dispose();
    }
}
