/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — ENEMYMANAGER.JS
 * Orquestrador Geral de Inimigos, Spawners e Bombas (Ultra Otimizado)
 * ============================================================================
 * - Cache estático consolidado de malhas interceptáveis (Zero GC)
 * - 1 Única PointLight estática compartilhada para explosões (Zero Shader Recompiles)
 * - Alto rendimento e FPS constante
 */

import * as THREE from 'three';
import { LadybugEnemy } from './LadybugEnemy.js';
import { CabinSpawner } from './CabinSpawner.js';
import { Bomb } from './Bomb.js';

export class EnemyManager {
    /**
     * @param {THREE.Scene} scene Cena Three.js
     * @param {import('../core/EventBus.js').EventBus} eventBus Barramento de eventos
     * @param {import('../world/TerrainArena.js').TerrainArena} terrainArena Instância do terreno
     */
    constructor(scene, eventBus, terrainArena) {
        this.scene = scene;
        this.eventBus = eventBus;
        this.terrainArena = terrainArena;

        // Coleções ativas
        this.spawners = [];
        this.enemies = [];
        this.bombs = [];

        // Cache consolidado de malhas interceptáveis
        this.targetableMeshes = [];
        this.allAimTargetableMeshesCache = [];

        // Configurações de Equilíbrio
        this.laserDPS = 180.0;
        this.maxGlobalEnemies = 8;

        // 1 Única Luz Estática Compartilhada para Explosões (permanece sempre na cena)
        this.sharedExplosionLight = new THREE.PointLight(0xff5500, 0.0, 22.0, 1.0);
        this.sharedExplosionLight.position.set(0, -100, 0);
        this.scene.add(this.sharedExplosionLight);
        this.explosionFlashTimer = 0.0;

        // Ouvir quando um inimigo finaliza o carregamento do modelo GLB
        this.eventBus.on('enemy:modelReady', () => {
            this.updateTargetableCache();
        });

        // Criar cabines iniciais
        this.setupInitialSpawners();
    }

    /**
     * Posiciona as cabines iniciais na arena de combate.
     */
    setupInitialSpawners() {
        // Cabine 1 (Setor Nordeste)
        this.createSpawner(28.0, 24.0, 5.0);
        // Cabine 2 (Setor Sudoeste)
        this.createSpawner(-32.0, -26.0, 6.0);
    }

    /**
     * Cria e registra uma nova cabine geradora.
     * @param {number} x
     * @param {number} z
     * @param {number} [interval]
     */
    createSpawner(x, z, interval = 5.5) {
        const y = this.terrainArena.getTerrainHeight(x, z);
        const spawner = new CabinSpawner(this.scene, this.eventBus, new THREE.Vector3(x, y, z), interval);
        this.spawners.push(spawner);
        this.updateTargetableCache();
        return spawner;
    }

    /**
     * Cria e registra um novo bot joaninha.
     * @param {THREE.Vector3} position
     * @param {THREE.Vector3} [direction]
     */
    spawnEnemy(position, direction = null) {
        const enemy = new LadybugEnemy(this.scene, this.eventBus, position, direction);
        this.enemies.push(enemy);
        this.updateTargetableCache();
        return enemy;
    }

    /**
     * Cria e registra uma nova bomba deixada no solo.
     * @param {THREE.Vector3} position
     */
    dropBomb(position) {
        const bomb = new Bomb(this.scene, this.eventBus, position, this);
        this.bombs.push(bomb);
    }

    /**
     * Dispara um clarão de luz na posição da explosão sem recriar objetos de iluminação.
     * @param {THREE.Vector3} pos
     */
    triggerExplosionFlash(pos) {
        this.sharedExplosionLight.position.set(pos.x, pos.y + 0.6, pos.z);
        this.sharedExplosionLight.intensity = 35.0;
        this.explosionFlashTimer = 0.30; // 300ms de decaimento
    }

    /**
     * Atualiza o cache de malhas sólidas de inimigos e cabines para o raycasting do laser.
     */
    updateTargetableCache() {
        this.targetableMeshes.length = 0;
        this.spawners.forEach((s) => {
            if (!s.isDestroyed && s.targetMesh) this.targetableMeshes.push(s.targetMesh);
        });
        this.enemies.forEach((e) => {
            if (!e.isDead && e.targetMesh) this.targetableMeshes.push(e.targetMesh);
        });

        // Atualizar lista combinada
        this.allAimTargetableMeshesCache = [...this.terrainArena.aimTargetableMeshes, ...this.targetableMeshes];
    }

    /**
     * Retorna a lista combinada de alvos em cache (Zero alocação no loop).
     * @returns {Array<THREE.Mesh>}
     */
    getAllAimTargetableMeshes() {
        return this.allAimTargetableMeshesCache;
    }

    /**
     * Aplica dano contínuo ao objeto interceptado pelo laser.
     * @param {THREE.Object3D} hitObject Objeto Three.js atingido pelo raio
     * @param {number} dt Delta time em segundos
     */
    applyLaserDamage(hitObject, dt) {
        if (!hitObject || !hitObject.userData?.entity) return;

        const entity = hitObject.userData.entity;
        const damage = this.laserDPS * dt;

        if (typeof entity.takeDamage === 'function') {
            entity.takeDamage(damage);
        }
    }

    /**
     * Atualiza todas as entidades no game loop.
     * @param {number} dt Delta time
     * @param {number} elapsedTime Tempo decorrido
     * @param {THREE.Vector3} hxPosition Posição central do HexaBOT
     */
    update(dt, elapsedTime, hxPosition) {
        let targetsNeedUpdate = false;

        // Decaimento do flash da luz de explosão
        if (this.explosionFlashTimer > 0) {
            this.explosionFlashTimer -= dt;
            const progress = THREE.MathUtils.clamp(this.explosionFlashTimer / 0.30, 0.0, 1.0);
            this.sharedExplosionLight.intensity = progress * 35.0;
        } else {
            this.sharedExplosionLight.intensity = 0.0;
        }

        // 1. Atualizar Cabines Spawners
        for (let i = this.spawners.length - 1; i >= 0; i--) {
            const spawner = this.spawners[i];
            const spawnInfo = spawner.update(dt, this.enemies.length, this.maxGlobalEnemies);

            if (spawnInfo.shouldSpawn && spawnInfo.spawnPos) {
                this.spawnEnemy(spawnInfo.spawnPos, spawnInfo.spawnDir);
                targetsNeedUpdate = true;
            }

            if (spawner.isFinished) {
                this.spawners.splice(i, 1);
                targetsNeedUpdate = true;
            }
        }

        // 2. Atualizar Inimigos Joaninhas
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            const enemyRes = enemy.update(dt, hxPosition, this.terrainArena);

            if (enemyRes.shouldDropBomb && enemyRes.dropPosition) {
                this.dropBomb(enemyRes.dropPosition);
            }

            if (enemy.isFinished) {
                this.enemies.splice(i, 1);
                targetsNeedUpdate = true;
            }
        }

        // 3. Atualizar Bombas
        for (let i = this.bombs.length - 1; i >= 0; i--) {
            const bomb = this.bombs[i];
            bomb.update(dt, hxPosition, this.enemies);

            if (bomb.isFinished) {
                this.bombs.splice(i, 1);
            }
        }

        if (targetsNeedUpdate) {
            this.updateTargetableCache();
        }
    }

    /**
     * Limpa e reseta todos os inimigos, bombas e reinicia as cabines.
     */
    reset() {
        this.spawners.forEach(s => s.dispose());
        this.enemies.forEach(e => e.dispose());
        this.bombs.forEach(b => b.dispose());

        this.spawners = [];
        this.enemies = [];
        this.bombs = [];
        this.targetableMeshes = [];

        this.setupInitialSpawners();
    }
}
