/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — LADYBUGENEMY.JS
 * Inimigo Joaninha com Modelo 3D GLTF/GLB e ShapeKey 'DROP' Otimizado
 * ============================================================================
 * - Carregamento assíncrono e cache global do modelo LadyBUG.glb
 * - Suporte nativo ao Morph Target / ShapeKey 'DROP' para elevação de patas ao plantar bomba
 * - Instanciação leve com compartilhamento de geometrias e buffers
 * - Hit flash dinâmico em PBR sem recompilação de shaders
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Cache Global do Modelo 3D da Joaninha
let cachedLadybugGltf = null;
let isLoadingLadybug = false;
const pendingInstances = [];

// Iniciar pré-carregamento imediato do modelo GLB
function preloadLadybugModel() {
    if (cachedLadybugGltf || isLoadingLadybug) return;
    isLoadingLadybug = true;

    const loader = new GLTFLoader();
    loader.load(
        'assets/glb/LadyBUG.glb',
        (gltf) => {
            cachedLadybugGltf = gltf;
            isLoadingLadybug = false;
            console.log('[LadybugEnemy] Modelo LadyBUG.glb carregado e cacheado com sucesso.');

            // Inicializar instâncias que foram spawnadas enquanto o download ocorria
            while (pendingInstances.length > 0) {
                const enemy = pendingInstances.shift();
                if (!enemy.isDead && !enemy.isFinished) {
                    enemy.applyLoadedModel();
                }
            }
        },
        undefined,
        (err) => {
            console.warn('[LadybugEnemy] Falha ao carregar assets/glb/LadyBUG.glb:', err);
            isLoadingLadybug = false;
        }
    );
}

// Disparar o pré-carregamento logo no módulo
preloadLadybugModel();

// Geometria e Material de fallback temporário (caso spawne antes do GLB carregar)
const FALLBACK_SPHERE_GEO = new THREE.SphereGeometry(1.2, 16, 16);
const FALLBACK_MAT = new THREE.MeshStandardMaterial({
    color: 0xd80020,
    metalness: 0.88,
    roughness: 0.22
});

// Hitbox Esférico Proxy Compartilhado (Invisível, Leve e Ultra Preciso para Raycast)
const SHARED_HITBOX_GEO = new THREE.SphereGeometry(1.40, 12, 10);
const SHARED_HITBOX_MAT = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.0,
    depthWrite: false
});

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
        this.radius = 1.2; // Raio 1.2m -> Modelo de 2.4m de diâmetro (Escala 1.2x)

        // Estados: 'SPAWNING', 'HUNTING', 'PLANTING', 'RETREATING', 'DEAD'
        this.state = 'SPAWNING';
        this.stateTimer = 0.8;
        this.spawnDirection = initialHeading ? initialHeading.clone().normalize() : new THREE.Vector3(0, 0, 1);

        // Combate e Vida (Resistência aumentada para combate mais tático)
        this.maxHp = 360;
        this.hp = this.maxHp;
        this.isDead = false;
        this.isFinished = false;
        this.hitFlashTimer = 0.0;

        // Controle de Bombas e Animação ShapeKey 'DROP'
        this.hasBombReady = true;
        this.bombCooldown = 0.0;
        this.currentDropWeight = 0.0;
        this.targetDropWeight = 0.0;

        // Efeito de Morte / Destruição
        this.deathProgress = 0.0;
        this.deathDuration = 0.35;

        // Coleções do Modelo 3D
        this.modelContainer = null;
        this.morphMeshes = [];
        this.dropMorphIndex = -1;
        this.materials = [];
        this.originalColors = [];
        this.fallbackVisualMesh = null;

        // Construir hierarquia 3D na cena
        this.group = new THREE.Group();
        this.group.position.copy(this.position);
        this.scene.add(this.group);

        // Hitbox esférico proxy calibrado (invisível, leve e com 100% de precisão para raycast)
        this.hitboxMesh = new THREE.Mesh(SHARED_HITBOX_GEO, SHARED_HITBOX_MAT);
        this.hitboxMesh.position.set(0, 0.70, 0);
        this.hitboxMesh.userData = { entity: this, type: 'enemy' };
        this.group.add(this.hitboxMesh);
        this.targetMesh = this.hitboxMesh;

        this.buildMesh();
    }

    /**
     * Constrói o modelo 3D utilizando o GLB cacheado ou agenda a aplicação quando terminar de carregar.
     */
    buildMesh() {
        if (cachedLadybugGltf) {
            this.applyLoadedModel();
        } else {
            // Visual provisório enquanto o GLB finaliza o download
            this.fallbackVisualMesh = new THREE.Mesh(FALLBACK_SPHERE_GEO, FALLBACK_MAT);
            this.group.add(this.fallbackVisualMesh);

            pendingInstances.push(this);
            preloadLadybugModel();
        }
    }

    /**
     * Clona a hierarquia do GLB, mapeia Morph Targets (ShapeKey DROP) e isola materiais.
     */
    applyLoadedModel() {
        if (!cachedLadybugGltf) return;

        // Remover fallback visual se existente
        if (this.fallbackVisualMesh && this.fallbackVisualMesh.parent === this.group) {
            this.group.remove(this.fallbackVisualMesh);
            this.fallbackVisualMesh = null;
        }

        this.modelContainer = new THREE.Group();
        // O modelo original no Blender tem a frente virada para -Z.
        // Giramos 180° (Math.PI) para alinhar a frente aos movimentos em +Z da física.
        this.modelContainer.rotation.y = Math.PI;
        // Escala 1.2x
        this.modelContainer.scale.set(1.2, 1.2, 1.2);

        const clonedScene = cachedLadybugGltf.scene.clone(true);
        this.modelContainer.add(clonedScene);
        this.group.add(this.modelContainer);

        this.morphMeshes = [];
        this.materials = [];
        this.originalColors = [];

        clonedScene.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = false; // Sombra dinâmica exclusiva da aranha
                child.receiveShadow = true;
                child.userData = { entity: this, type: 'enemy' };

                // Identificar ShapeKey / MorphTarget 'DROP'
                if (child.morphTargetDictionary && child.morphTargetDictionary['DROP'] !== undefined) {
                    this.morphMeshes.push(child);
                    this.dropMorphIndex = child.morphTargetDictionary['DROP'];
                }

                // Clonar materiais por instância para suportar flash de dano individual
                if (Array.isArray(child.material)) {
                    child.material = child.material.map((mat) => {
                        const m = mat.clone();
                        this.materials.push(m);
                        this.originalColors.push({
                            color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
                            emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0x000000),
                            emissiveIntensity: m.emissiveIntensity || 0.0
                        });
                        return m;
                    });
                } else if (child.material) {
                    const m = child.material.clone();
                    child.material = m;
                    this.materials.push(m);
                    this.originalColors.push({
                        color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
                        emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0x000000),
                        emissiveIntensity: m.emissiveIntensity || 0.0
                    });
                }
            }
        });

        this.eventBus.emit('enemy:modelReady');
    }

    /**
     * Aplica dano ao inimigo.
     * @param {number} damage Quantidade de dano sofrido
     */
    takeDamage(damage) {
        if (this.isDead) return;

        this.hp -= damage;
        this.hitFlashTimer = 0.09;

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

        // Efeito visual térmico/explosivo nos materiais
        this.materials.forEach((m) => {
            if (m.color) m.color.setHex(0xffaa00);
            if (m.emissive) {
                m.emissive.setHex(0xff5500);
                m.emissiveIntensity = 1.2;
            }
        });

        // Disparar efeito sonoro 3D espacial de explosão/pop
        this.eventBus.emit('sound:pop', this.position.clone());
    }

    /**
     * Atualiza a animação do ShapeKey 'DROP' e a elevação física das patinhas.
     * @param {number} dt Delta time em segundos
     */
    updateMorphAnimation(dt) {
        // Amortecimento suave na transição do ShapeKey
        const interpSpeed = this.state === 'PLANTING' ? 9.0 : 6.0;
        this.currentDropWeight = THREE.MathUtils.damp(
            this.currentDropWeight,
            this.targetDropWeight,
            interpSpeed,
            dt
        );

        // Aplicar influência do morph target em todas as submalhas/primitivas
        if (this.dropMorphIndex >= 0) {
            for (let i = 0; i < this.morphMeshes.length; i++) {
                const mesh = this.morphMeshes[i];
                if (mesh.morphTargetInfluences) {
                    mesh.morphTargetInfluences[this.dropMorphIndex] = this.currentDropWeight;
                }
            }
        }

        // Elevação sutil adicional do corpo enquanto levanta as patinhas para dropar a bomba
        if (this.modelContainer) {
            this.modelContainer.position.y = this.currentDropWeight * 0.18;
        }
    }

    /**
     * Atualiza a lógica de IA, movimento e colisão com terreno.
     * @param {number} dt Delta time em segundos
     * @param {THREE.Vector3} hxPosition Posição central do HexaBOT
     * @param {import('../world/TerrainArena.js').TerrainArena} terrainArena
     * @param {boolean} [hxIsDead=false] Se o HexaBOT está morto/paralisado
     * @returns {{ shouldDropBomb: boolean, dropPosition: THREE.Vector3 }}
     */
    update(dt, hxPosition, terrainArena, hxIsDead = false) {
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
            this.materials.forEach((m) => {
                if (m.color) m.color.setHex(0xffffff);
                if (m.emissive) {
                    m.emissive.setHex(0xff4422);
                    m.emissiveIntensity = 0.85;
                }
            });
        } else {
            // Restaurar cores e emissivos originais
            for (let i = 0; i < this.materials.length; i++) {
                const m = this.materials[i];
                const orig = this.originalColors[i];
                if (orig) {
                    if (m.color) m.color.copy(orig.color);
                    if (m.emissive) {
                        m.emissive.copy(orig.emissive);
                        m.emissiveIntensity = orig.emissiveIntensity;
                    }
                }
            }
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
        if (hxIsDead) {
            // RITUAL DE VITÓRIA: Formar um círculo e correr em volta da HX caída
            this.state = 'CIRCLING';
            this.targetDropWeight = 0.0;

            if (this.orbitAngle === undefined) {
                this.orbitAngle = Math.atan2(this.position.x - hxPosition.x, this.position.z - hxPosition.z);
            }
            if (this.orbitRadius === undefined) {
                this.orbitRadius = 7.5 + (Math.random() * 1.8);
            }
            if (this.orbitSpeed === undefined) {
                this.orbitSpeed = 5.2 + Math.random() * 1.2;
            }

            // Progresso orbital contínuo (sentido horário)
            this.orbitAngle += (this.orbitSpeed / this.orbitRadius) * dt;

            const targetX = hxPosition.x + Math.sin(this.orbitAngle) * this.orbitRadius;
            const targetZ = hxPosition.z + Math.cos(this.orbitAngle) * this.orbitRadius;

            this.position.x = THREE.MathUtils.damp(this.position.x, targetX, 5.0, dt);
            this.position.z = THREE.MathUtils.damp(this.position.z, targetZ, 5.0, dt);

            // Orientação tangencial ao círculo da dança
            const tangentHeading = this.orbitAngle + Math.PI / 2;
            let diff = tangentHeading - this.heading;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            this.heading += diff * Math.min(1.0, dt * 8.0);
        } else {
            // Limpar parâmetros orbitais caso o robô seja revivido/resetado
            this.orbitAngle = undefined;
            this.orbitRadius = undefined;
            this.orbitSpeed = undefined;

            if (this.state === 'SPAWNING') {
                this.targetDropWeight = 0.0;
                this.stateTimer -= dt;
                this.position.x += this.spawnDirection.x * this.speed * dt;
                this.position.z += this.spawnDirection.z * this.speed * dt;
                this.heading = Math.atan2(this.spawnDirection.x, this.spawnDirection.z);

                if (this.stateTimer <= 0) {
                    this.state = 'HUNTING';
                }
            } else if (this.state === 'HUNTING' || this.state === 'CIRCLING') {
                this.targetDropWeight = 0.0;
                const targetHeading = Math.atan2(dirX, dirZ);

                let diff = targetHeading - this.heading;
                diff = Math.atan2(Math.sin(diff), Math.cos(diff));
                this.heading += diff * Math.min(1.0, dt * 8.0);

                this.position.x += Math.sin(this.heading) * this.speed * dt;
                this.position.z += Math.cos(this.heading) * this.speed * dt;

                // Se chegou perto / debaixo do chassi do HexaBOT
                if (distToHx < 1.95 && this.hasBombReady) {
                    this.state = 'PLANTING';
                    this.stateTimer = 0.65; // Tempo para a animação do ShapeKey 'DROP' se elevar
                    this.targetDropWeight = 1.0; // Levanta as patas e eleva o corpo
                }
            } else if (this.state === 'PLANTING') {
                this.targetDropWeight = 1.0;
                this.stateTimer -= dt;

                if (this.stateTimer <= 0) {
                    shouldDropBomb = true;
                    dropPosition = this.position.clone();
                    this.hasBombReady = false;
                    this.bombCooldown = 5.0;

                    // Disparar fala 3D espacial da joaninha: "Kaboom! Hahahahaha!"
                    this.eventBus.emit('sound:kaboom', this.position.clone());

                    this.state = 'RETREATING';
                    this.stateTimer = 2.0;
                    this.targetDropWeight = 0.0; // Retorna patinhas ao solo
                }
            } else if (this.state === 'RETREATING') {
                this.targetDropWeight = 0.0;
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
        }

        // Atualizar ShapeKey e elevação
        this.updateMorphAnimation(dt);

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
        const idx = pendingInstances.indexOf(this);
        if (idx !== -1) {
            pendingInstances.splice(idx, 1);
        }

        if (this.group && this.group.parent) {
            this.group.parent.remove(this.group);
        }

        this.materials.forEach((m) => m.dispose());
        this.materials = [];
        this.morphMeshes = [];
    }
}
