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

        // Estado da Dança Tribal Coordenada
        this.tribalCircleActive = false;
        this.tribalMasterAngle = 0.0;
        this.hasStartedTribalMusic = false;

        // Estado de Vitória (Todos os inimigos destruídos)
        this.hasSpawnedEnemies = false;
        this.victoryTriggered = false;

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
        this.hasSpawnedEnemies = true;
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
     * @param {boolean} [hxIsDead=false] Se o HexaBOT está morto/paralisado
     */
    update(dt, elapsedTime, hxPosition, hxIsDead = false) {
        let targetsNeedUpdate = false;

        // Decaimento do flash da luz de explosão
        if (this.explosionFlashTimer > 0) {
            this.explosionFlashTimer -= dt;
            const progress = THREE.MathUtils.clamp(this.explosionFlashTimer / 0.30, 0.0, 1.0);
            this.sharedExplosionLight.intensity = progress * 35.0;
        } else {
            this.sharedExplosionLight.intensity = 0.0;
        }

        // 1. Atualizar Cabines Spawners (Pausa geração de novos inimigos se a HX estiver morta)
        if (!hxIsDead) {
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
        }

        // 2. Atualizar Inimigos Joaninhas (comporta ritual de dança circular se a HX estiver morta)
        let tribalSlots = null;
        if (hxIsDead) {
            tribalSlots = this.calculateTribalCircleSlots(hxPosition, dt);
        } else {
            if (this.tribalCircleActive) {
                this.tribalCircleActive = false;
                this.hasStartedTribalMusic = false;
                this.enemies.forEach(e => {
                    e.circleSlotIndex = null;
                    e.isInOrbit = false;
                });
            }
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            const slot = (tribalSlots && enemy.circleSlotIndex !== null) ? tribalSlots[enemy.circleSlotIndex] : null;
            const enemyRes = enemy.update(dt, hxPosition, this.terrainArena, hxIsDead, slot);

            if (enemyRes.shouldDropBomb && enemyRes.dropPosition) {
                this.dropBomb(enemyRes.dropPosition);
            }

            if (enemy.isFinished) {
                this.enemies.splice(i, 1);
                targetsNeedUpdate = true;
            }
        }

        // Se houver pelo menos 1 joaninha que entrou no perímetro da órbita, inicia a música tribal
        if (hxIsDead && !this.hasStartedTribalMusic) {
            const anyInOrbit = this.enemies.some(e => !e.isDead && e.isInOrbit);
            if (anyInOrbit) {
                this.hasStartedTribalMusic = true;
                this.eventBus.emit('music:tribalStart');
                console.log('[EnemyManager] Primeira joaninha iniciou a dança circular -> Música tribal disparada!');
            }
        }

        // 2.1 Aplicar separação física e desvio mútuo entre joaninhas (Anti-Nesting / Flocking Separation)
        this.applyEnemySeparation();

        // 3. Atualizar Bombas
        for (let i = this.bombs.length - 1; i >= 0; i--) {
            const bomb = this.bombs[i];
            bomb.update(dt, hxPosition, this.enemies);

            if (bomb.isFinished) {
                this.bombs.splice(i, 1);
            }
        }

        // 4. Verificar Condição de Vitória (Todas as cabines e joaninhas destruídas)
        if (this.hasSpawnedEnemies && !hxIsDead && !this.victoryTriggered) {
            if (this.spawners.length === 0 && this.enemies.length === 0) {
                this.victoryTriggered = true;
                this.eventBus.emit('combat:victory');
                console.log('[EnemyManager] Todos os inimigos destruídos! Disparando Dança da Vitória!');
            }
        }

        if (targetsNeedUpdate) {
            this.updateTargetableCache();
        }
    }

    /**
     * Calcula e distribui as joaninhas em fila encadeada e coesa no círculo tribal.
     * Ordena por proximidade ao HexaBOT e por ordem de criação (ID).
     * @param {THREE.Vector3} hxPosition
     * @param {number} dt
     * @returns {Array<{ x: number, z: number, angle: number, radius: number }>}
     */
    calculateTribalCircleSlots(hxPosition, dt) {
        const aliveEnemies = this.enemies.filter(e => !e.isDead && !e.isFinished);
        const count = aliveEnemies.length;
        if (count === 0) return null;

        const circleRadius = 8.2;
        const orbitSpeed = 5.5;

        // Se a formação acabou de ser acionada, ordenar e atribuir slots
        if (!this.tribalCircleActive) {
            this.tribalCircleActive = true;

            // 1. Ordenar por proximidade ao HexaBOT; desempate por ordem de criação (creationId)
            aliveEnemies.sort((a, b) => {
                const distA = Math.hypot(a.position.x - hxPosition.x, a.position.z - hxPosition.z);
                const distB = Math.hypot(b.position.x - hxPosition.x, b.position.z - hxPosition.z);
                if (Math.abs(distA - distB) > 0.05) {
                    return distA - distB; // Mais próximo primeiro
                }
                return a.creationId - b.creationId; // Ordem de criação
            });

            // 2. O primeiro da fila (líder) define o ângulo inicial da formação
            const leader = aliveEnemies[0];
            this.tribalMasterAngle = Math.atan2(leader.position.x - hxPosition.x, leader.position.z - hxPosition.z);

            // 3. Atribuir os índices de slot em fila encadeada
            aliveEnemies.forEach((e, idx) => {
                e.circleSlotIndex = idx;
            });
        }

        // Progresso do ângulo mestre da formação circular (sentido horário)
        this.tribalMasterAngle += (orbitSpeed / circleRadius) * dt;

        // Gerar coordenadas dos slots perfeitamente equidistantes no círculo (2*PI / N)
        const slots = [];
        const angleStep = (Math.PI * 2) / Math.max(1, count);

        for (let i = 0; i < count; i++) {
            const slotAngle = this.tribalMasterAngle - (i * angleStep);
            const slotX = hxPosition.x + Math.sin(slotAngle) * circleRadius;
            const slotZ = hxPosition.z + Math.cos(slotAngle) * circleRadius;
            slots.push({
                x: slotX,
                z: slotZ,
                angle: slotAngle,
                radius: circleRadius
            });
        }

        return slots;
    }

    /**
     * Aplica separação elástica suave (Anti-Nesting / Flocking Separation) para impedir que as joaninhas se aninhem.
     * Custo computacional: N*(N-1)/2 para N <= 8 (no máximo 28 comparações 2D por frame, < 0.001ms / Zero GC).
     */
    applyEnemySeparation() {
        const count = this.enemies.length;
        if (count < 2) return;

        const minDistance = 2.40; // Diâmetro de colisão (1.2m de raio * 2)
        const minDistanceSq = minDistance * minDistance;

        for (let i = 0; i < count; i++) {
            const e1 = this.enemies[i];
            if (e1.isDead || e1.isFinished) continue;

            for (let j = i + 1; j < count; j++) {
                const e2 = this.enemies[j];
                if (e2.isDead || e2.isFinished) continue;

                let dx = e2.position.x - e1.position.x;
                let dz = e2.position.z - e1.position.z;
                let distSq = dx * dx + dz * dz;

                if (distSq < minDistanceSq && distSq > 0.00001) {
                    const dist = Math.sqrt(distSq);
                    const overlap = (minDistance - dist) * 0.5;
                    const nx = dx / dist;
                    const nz = dz / dist;

                    // Empurrar suavemente em direções opostas
                    e1.position.x -= nx * overlap;
                    e1.position.z -= nz * overlap;
                    e2.position.x += nx * overlap;
                    e2.position.z += nz * overlap;

                    // Atualizar elevação no relevo e matriz de transformação Three.js
                    e1.position.y = this.terrainArena.getTerrainHeight(e1.position.x, e1.position.z);
                    e1.group.position.copy(e1.position);

                    e2.position.y = this.terrainArena.getTerrainHeight(e2.position.x, e2.position.z);
                    e2.group.position.copy(e2.position);
                }
            }
        }
    }

    /**
     * Limpa e reseta todos os inimigos, bombas e reinicia as cabines.
     */
    reset() {
        this.tribalCircleActive = false;
        this.tribalMasterAngle = 0.0;
        this.hasStartedTribalMusic = false;
        this.victoryTriggered = false;
        this.hasSpawnedEnemies = false;

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
