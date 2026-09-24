/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — TERRAINARENA.JS
 * Arena Procedural com Dunas, Blocos Escaláveis, Pilares e Shader PBR
 * ============================================================================
 * Responsável por:
 * - Cálculo contínuo e analítico da altura do solo (getBaseGroundMeshHeight)
 * - Geração de dunas e escombros procedurais positivos (sem zonas negativas)
 * - Instanciação de plataformas e degraus sólidos escaláveis (steppableBoxes)
 * - Criação de pilares cilíndricos com bordas neon
 * - Shader PBR customizado com blend de normal maps (Ladrilho Metálico vs Areia Fosca)
 * - Recálculo dinâmico de vértices e relevo via slider HUD
 */

import * as THREE from 'three';

export class TerrainArena {
    /**
     * @param {THREE.Scene} scene Cena Three.js onde a arena será adicionada
     */
    constructor(scene) {
        this.scene = scene;
        this.arenaGroup = new THREE.Group();
        this.scene.add(this.arenaGroup);

        // Multiplicador dinâmico de relevo padrão 1.20x
        this.currentTerrainReliefScale = 1.20;

        // Lista de montículos de entulho/escombros positivos no terreno
        this.bumps = [
            { x: 32, z: 26, radius: 24, height: 4.8 },
            { x: -36, z: 42, radius: 26, height: 5.4 },
            { x: 48, z: -38, radius: 25, height: 4.5 },
            { x: -48, z: -36, radius: 28, height: 5.2 },
            { x: 2, z: 52, radius: 22, height: 3.8 },
            { x: 55, z: 2, radius: 24, height: 4.2 },
            { x: -20, z: -25, radius: 18, height: 3.6 },
            { x: 25, z: 20, radius: 20, height: 3.8 },
            { x: -26, z: 16, radius: 18, height: 3.2 },
            { x: 26, z: -22, radius: 20, height: 3.0 },
            { x: -16, z: -46, radius: 22, height: 3.6 },
            { x: 38, z: 36, radius: 19, height: 2.8 },
            { x: -46, z: 2, radius: 18, height: 3.0 },
            { x: 18, z: -50, radius: 24, height: 3.4 }
        ];

        // Coleção de plataformas e cubos pisáveis (Geometria Sólida)
        this.steppableBoxes = [
            { x: 12.0, z: 8.0, sizeX: 8.0, sizeZ: 8.0, height: 0.8, rotY: 0.2 },
            { x: 19.0, z: 14.0, sizeX: 7.5, sizeZ: 7.5, height: 1.5, rotY: -0.3 },
            { x: -14.0, z: 7.0, sizeX: 9.0, sizeZ: 7.0, height: 1.2, rotY: 0.35 },
            { x: -10.0, z: -15.0, sizeX: 8.0, sizeZ: 8.0, height: 0.9, rotY: -0.2 },
            { x: 11.0, z: -14.0, sizeX: 8.0, sizeZ: 9.0, height: 1.6, rotY: 0.45 },
            { x: 0.0, z: 22.0, sizeX: 11.0, sizeZ: 7.0, height: 1.1, rotY: 0.0 },
            { x: 0.0, z: -24.0, sizeX: 12.0, sizeZ: 8.0, height: 1.4, rotY: 0.1 },
            { x: 36.0, z: 12.0, sizeX: 13.0, sizeZ: 11.0, height: 2.0, rotY: 0.35 },
            { x: -40.0, z: -20.0, sizeX: 12.0, sizeZ: 12.0, height: 2.2, rotY: -0.4 },
            { x: 24.0, z: -40.0, sizeX: 11.0, sizeZ: 14.0, height: 1.8, rotY: 0.6 },
            { x: -30.0, z: 40.0, sizeX: 15.0, sizeZ: 11.0, height: 2.4, rotY: -0.5 },
            { x: 46.0, z: -26.0, sizeX: 13.0, sizeZ: 13.0, height: 2.5, rotY: 0.15 }
        ];

        // Layout estratégico dos Pilares e Colunas (com Raio de Colisão)
        this.pillarLayout = [
            { x: 28.0, z: -22.0, radius: 4.8 },
            { x: -32.0, z: 28.0, radius: 4.8 },
            { x: 42.0, z: 38.0, radius: 4.8 },
            { x: -44.0, z: -38.0, radius: 4.8 },
            { x: 58.0, z: -12.0, radius: 4.8 },
            { x: -58.0, z: 14.0, radius: 4.8 },
            { x: 16.0, z: 62.0, radius: 4.8 },
            { x: -18.0, z: -64.0, radius: 4.8 },
            { x: 74.0, z: 48.0, radius: 4.8 },
            { x: -74.0, z: -52.0, radius: 4.8 },
            { x: 82.0, z: -38.0, radius: 4.8 },
            { x: -84.0, z: 42.0, radius: 4.8 },
            { x: 0.0, z: 86.0, radius: 4.8 },
            { x: 0.0, z: -86.0, radius: 4.8 },
            { x: 92.0, z: 0.0, radius: 4.8 },
            { x: -92.0, z: 0.0, radius: 4.8 }
        ];

        this.decorativePillars = [];
        this.pillarsData = [];
        this.aimTargetableMeshes = [];

        // Precomputar valores constantes dos bumps para aceleração matemática
        this.bumps.forEach((b) => {
            b.radiusSq = b.radius * b.radius;
            b.invRadius = 1.0 / b.radius;
        });

        // Inicializar alturas base e constantes das caixas
        this.steppableBoxes.forEach((b) => {
            b.baseY = this.getBaseGroundMeshHeight(b.x, b.z);
            b.topY = b.baseY + b.height;
            b.cosRotY = b.rotY ? Math.cos(-b.rotY) : 1.0;
            b.sinRotY = b.rotY ? Math.sin(-b.rotY) : 0.0;
            b.halfX = b.sizeX * 0.5;
            b.halfZ = b.sizeZ * 0.5;
        });

        // Construir malha do terreno, shader, blocos e pilares
        this.buildTerrainMesh();
        this.buildSteppableBoxes();
        this.buildPillars();
        this.buildGridHelper();
    }

    /**
     * Calcula a altitude contínua da malha do solo com dunas procedurais.
     * Possui clipping estrito em Y = 0 (sem depressões subterrâneas).
     * @param {number} x Coordenada X no mundo
     * @param {number} z Coordenada Z no mundo
     * @returns {number} Altura Y do solo
     */
    getBaseGroundMeshHeight(x, z) {
        const relief = this.currentTerrainReliefScale;
        const dSq = x * x + z * z;
        if (dSq < 100.0) return 0.0; // Centro plano inicial (d < 10)
        const d = Math.sqrt(dSq);
        const centerFade = (d < 16.0) ? (d - 10.0) * 0.166666 : 1.0;

        // Ondulações base suaves de entulho (apenas positivas)
        const wave1 = Math.max(0.0, Math.sin(x * 0.035) * Math.cos(z * 0.035)) * 0.9;
        const wave2 = Math.max(0.0, Math.sin(x * 0.018 + 0.8) * Math.cos(z * 0.018)) * 1.35;
        let h = (wave1 + wave2) * relief;

        for (let i = 0; i < this.bumps.length; i++) {
            const b = this.bumps[i];
            if (b.height <= 0) continue;
            const dx = x - b.x;
            const dz = z - b.z;
            const distBSq = dx * dx + dz * dz;
            if (distBSq < (b.radiusSq || (b.radius * b.radius))) {
                const distB = Math.sqrt(distBSq);
                const factor = 0.5 * (1.0 + Math.cos(distB * (b.invRadius || (1.0 / b.radius)) * Math.PI));
                h += b.height * relief * factor;
            }
        }

        // Clipping em Y = 0
        return Math.max(0.0, h * centerFade);
    }

    /**
     * Retorna a altitude unificada do solo, considerando tanto a malha contínua
     * quanto o topo das caixas e plataformas pisáveis.
     * @param {number} x
     * @param {number} z
     * @returns {number} Altitude em Y da superfície
     */
    getTerrainHeight(x, z) {
        let surfaceY = this.getBaseGroundMeshHeight(x, z);

        for (let i = 0; i < this.steppableBoxes.length; i++) {
            const b = this.steppableBoxes[i];
            let dx = x - b.x;
            let dz = z - b.z;
            if (b.rotY) {
                const lx = dx * b.cosRotY - dz * b.sinRotY;
                const lz = dx * b.sinRotY + dz * b.cosRotY;
                dx = lx;
                dz = lz;
            }
            if (Math.abs(dx) <= b.halfX && Math.abs(dz) <= b.halfZ) {
                if (b.topY > surfaceY) {
                    surfaceY = b.topY;
                }
            }
        }

        return surfaceY;
    }

    /**
     * Constrói a malha principal de terreno (280x280m com 140x140 subdivisões)
     * e aplica o Shader PBR avançado com mistura de mapas normais e texturas procedurais.
     */
    buildTerrainMesh() {
        this.terrainGeo = new THREE.PlaneGeometry(280, 280, 140, 140);
        this.terrainGeo.rotateX(-Math.PI / 2);

        const posAttr = this.terrainGeo.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            const px = posAttr.getX(i);
            const pz = posAttr.getZ(i);
            posAttr.setY(i, this.getBaseGroundMeshHeight(px, pz));
        }
        this.terrainGeo.computeVertexNormals();

        // Carregar Normal Maps de Piso e Areia
        const textureLoader = new THREE.TextureLoader();
        const floorNormalTex = textureLoader.load('./assets/img/normal/piso.jfif');
        floorNormalTex.wrapS = THREE.RepeatWrapping;
        floorNormalTex.wrapT = THREE.RepeatWrapping;
        floorNormalTex.colorSpace = THREE.NoColorSpace;

        const sandNormalTex = textureLoader.load('./assets/img/normal/areia_2.jfif');
        sandNormalTex.wrapS = THREE.RepeatWrapping;
        sandNormalTex.wrapT = THREE.RepeatWrapping;
        sandNormalTex.colorSpace = THREE.NoColorSpace;

        this.terrainMat = new THREE.MeshStandardMaterial({
            roughness: 0.65,
            metalness: 0.05,
            envMapIntensity: 0.05,
            wireframe: false
        });

        // Injeção de Shader Customizado no Material Standard
        this.terrainMat.onBeforeCompile = (shader) => {
            shader.uniforms.uFloorNormalMap = { value: floorNormalTex };
            shader.uniforms.uSandNormalMap = { value: sandNormalTex };
            shader.uniforms.uNormalScale = { value: 0.30 };

            shader.vertexShader = `
                varying float vWorldY;
                varying vec2 vWorldXZ;
                ${shader.vertexShader}
            `.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                vWorldY = transformed.y;
                vWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
                `
            );

            shader.fragmentShader = `
                uniform sampler2D uFloorNormalMap;
                uniform sampler2D uSandNormalMap;
                uniform float uNormalScale;
                varying float vWorldY;
                varying vec2 vWorldXZ;
                ${shader.fragmentShader}
            `.replace(
                '#include <normal_fragment_maps>',
                `
                #include <normal_fragment_maps>

                // --- NORMAL MAPPING BLEND (PISO vs AREIA) ---
                float hNorm = max(0.0, vWorldY);
                float rubbleBlendNorm = smoothstep(0.02, 0.35, hNorm);

                // Piso com repetição de 8m x 8m (a imagem piso.jfif possui 2x2 ladrilhos internos de 4m x 4m cada)
                vec3 nFloorMap = texture2D(uFloorNormalMap, vWorldXZ / 8.0).xyz * 2.0 - 1.0;

                // Areia e escombros com escala de repetição de 3.2m
                vec3 nSandMap = texture2D(uSandNormalMap, vWorldXZ / 3.2).xyz * 2.0 - 1.0;

                // Mistura suave dos mapas normais de acordo com a elevação do relevo
                vec3 mapN = mix(nFloorMap, nSandMap, rubbleBlendNorm);
                mapN.xy *= uNormalScale;
                mapN = normalize(mapN);

                // Construção da base ortonormal TBN em View Space alinhada com o mundo XZ
                vec3 tView = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
                vec3 bView = normalize((viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
                tView = normalize(tView - dot(tView, normal) * normal);
                bView = normalize(cross(normal, tView));

                normal = normalize(tView * mapN.x + bView * mapN.y + normal * mapN.z);
                `
            ).replace(
                '#include <roughnessmap_fragment>',
                `
                #include <roughnessmap_fragment>

                // Rugosidade adaptativa: Placas do piso acetinadas (0.34), juntas foscas (0.80), terra/areia fosca (0.92)
                vec2 rTileUV = vWorldXZ / 4.0;
                vec2 rFTile = fract(rTileUV);
                vec2 rGridLine = smoothstep(0.0, 0.025, rFTile) * smoothstep(1.0, 0.975, rFTile);
                float rBorderMask = min(rGridLine.x, rGridLine.y);

                float rH = max(0.0, vWorldY);
                float rRubbleBlend = smoothstep(0.02, 0.30, rH);

                float floorRoughness = mix(0.80, 0.34, rBorderMask);
                roughnessFactor = mix(floorRoughness, 0.92, rRubbleBlend);
                `
            ).replace(
                '#include <metalnessmap_fragment>',
                `
                #include <metalnessmap_fragment>

                // Metalicidade adaptativa: Placas do piso metálicas (0.55), juntas oxidadas (0.12), terra/areia mineral (0.04)
                vec2 mTileUV = vWorldXZ / 4.0;
                vec2 mFTile = fract(mTileUV);
                vec2 mGridLine = smoothstep(0.0, 0.025, mFTile) * smoothstep(1.0, 0.975, mFTile);
                float mBorderMask = min(mGridLine.x, mGridLine.y);

                float mH = max(0.0, vWorldY);
                float mRubbleBlend = smoothstep(0.02, 0.30, mH);

                float floorMetalness = mix(0.12, 0.55, mBorderMask);
                metalnessFactor = mix(floorMetalness, 0.04, mRubbleBlend);
                `
            ).replace(
                '#include <color_fragment>',
                `
                #include <color_fragment>

                // --- 1. TEXTURA PROCEDURAL TILE PARA O PISO PLANO (Y = 0) ---
                vec2 tileUV = vWorldXZ / 4.0;
                vec2 fTile = fract(tileUV);
                vec2 gridLine = smoothstep(0.0, 0.025, fTile) * smoothstep(1.0, 0.975, fTile);
                float borderMask = min(gridLine.x, gridLine.y);

                float tileCheck = mod(floor(tileUV.x) + floor(tileUV.y), 2.0);
                vec3 colFloorTileA = vec3(0.11, 0.14, 0.18); // Ladrilho ardósia
                vec3 colFloorTileB = vec3(0.085, 0.11, 0.145); // Ladrilho complementar
                vec3 colFloorTile = mix(colFloorTileA, colFloorTileB, tileCheck * 0.45);

                vec3 colFloorBorder = vec3(0.020, 0.028, 0.040); // Juntas e ranhuras
                vec3 finalTileFloor = mix(colFloorBorder, colFloorTile, borderMask);

                // --- 2. ESCOMBROS E MONTÍCULOS TERROSOS SOMBRIOS (Y > 0) ---
                vec3 colEarthBase = vec3(0.07, 0.045, 0.030);
                vec3 colEarthMid  = vec3(0.13, 0.085, 0.055);
                vec3 colEarthPeak = vec3(0.19, 0.130, 0.085);

                float h = max(0.0, vWorldY);
                float tElevation = smoothstep(0.2, 4.5, h);
                vec3 colRubble = mix(colEarthBase, mix(colEarthMid, colEarthPeak, smoothstep(1.5, 4.5, h)), tElevation);

                // --- 3. TRANSIÇÃO SUAVE ENTRE O PISO TILE E OS ESCOMBROS ---
                float rubbleBlend = smoothstep(0.02, 0.30, h);
                vec3 finalTerrain = mix(finalTileFloor, colRubble, rubbleBlend);

                diffuseColor = vec4(finalTerrain, 1.0);
                `
            );
        };

        this.terrainMesh = new THREE.Mesh(this.terrainGeo, this.terrainMat);
        this.terrainMesh.receiveShadow = true;
        this.arenaGroup.add(this.terrainMesh);
    }

    /**
     * Constrói os monólitos e cubos escaláveis com bordas neon, sancas e rodapés iluminados.
     */
    buildSteppableBoxes() {
        const boxMat = new THREE.MeshStandardMaterial({
            color: 0x090d14,
            roughness: 0.88,
            metalness: 0.15
        });
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.35 });
        const padMat = new THREE.MeshStandardMaterial({
            color: 0x05070c,
            emissive: 0x00060d,
            roughness: 0.85,
            metalness: 0.2
        });

        // Materiais Emissivos para Sancas e Rodapés (Quake III / Sci-Fi Cove Lights)
        this.coveCyanMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending
        });

        this.coveAmberMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending
        });

        this.blinkingPanelMatA = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.90,
            blending: THREE.AdditiveBlending
        });

        this.blinkingPanelMatB = new THREE.MeshBasicMaterial({
            color: 0xff8800,
            transparent: true,
            opacity: 0.80,
            blending: THREE.AdditiveBlending
        });

        this.steppableBoxes.forEach((b, idx) => {
            const boxGroup = new THREE.Group();
            boxGroup.position.set(b.x, b.baseY + b.height * 0.5, b.z);
            if (b.rotY) boxGroup.rotation.y = b.rotY;

            // 1. Bloco principal
            const bGeo = new THREE.BoxGeometry(b.sizeX, b.height, b.sizeZ);
            const bMesh = new THREE.Mesh(bGeo, boxMat);
            bMesh.castShadow = false; // Sombra exclusiva da HX
            bMesh.receiveShadow = true;
            boxGroup.add(bMesh);
            this.aimTargetableMeshes.push(bMesh);

            // 2. Borda Holográfica Neon
            const edges = new THREE.EdgesGeometry(bGeo);
            const line = new THREE.LineSegments(edges, edgeMat);
            boxGroup.add(line);

            // 3. Pad tático no topo
            const padGeo = new THREE.PlaneGeometry(b.sizeX * 0.85, b.sizeZ * 0.85);
            padGeo.rotateX(-Math.PI / 2);
            const padMesh = new THREE.Mesh(padGeo, padMat);
            padMesh.position.y = b.height * 0.5 + 0.01;
            padMesh.receiveShadow = true;
            boxGroup.add(padMesh);
            this.aimTargetableMeshes.push(padMesh);

            // 4. Luz de Rodapé / Sanca de Base (Contorno luminoso rente ao chão)
            const baseCoveGeo = new THREE.BoxGeometry(b.sizeX + 0.08, 0.06, b.sizeZ + 0.08);
            const coveMat = (idx % 2 === 0) ? this.coveCyanMat : this.coveAmberMat;
            const baseCoveMesh = new THREE.Mesh(baseCoveGeo, coveMat);
            baseCoveMesh.position.y = -b.height * 0.5 + 0.03;
            boxGroup.add(baseCoveMesh);

            // 5. Sanca Oculta Sub-borda Superior
            const topCoveGeo = new THREE.BoxGeometry(b.sizeX + 0.06, 0.04, b.sizeZ + 0.06);
            const topCoveMesh = new THREE.Mesh(topCoveGeo, (idx % 2 === 0) ? this.coveAmberMat : this.coveCyanMat);
            topCoveMesh.position.y = b.height * 0.5 - 0.04;
            boxGroup.add(topCoveMesh);

            // 6. Luzes de Canto / Balizadores de Piso
            const cornerSize = 0.22;
            const cornerGeo = new THREE.BoxGeometry(cornerSize, 0.08, cornerSize);
            const hx = b.sizeX * 0.44;
            const hz = b.sizeZ * 0.44;
            const corners = [
                { cx: -hx, cz: -hz }, { cx: hx, cz: -hz },
                { cx: -hx, cz: hz }, { cx: hx, cz: hz }
            ];
            corners.forEach((c) => {
                const cornerMesh = new THREE.Mesh(cornerGeo, this.coveCyanMat);
                cornerMesh.position.set(c.cx, b.height * 0.5 + 0.04, c.cz);
                boxGroup.add(cornerMesh);
            });

            // 7. Luz de apoio suave nas plataformas centrais (sem sombra, zero travamento)
            if (idx < 5) {
                const coveLight = new THREE.PointLight(
                    (idx % 2 === 0) ? 0x00d2ff : 0xff9900,
                    1.6,
                    16.0
                );
                coveLight.position.set(0, 0.3, 0);
                coveLight.castShadow = false;
                boxGroup.add(coveLight);
            }

            b.groupMesh = boxGroup;
            this.arenaGroup.add(boxGroup);
        });
    }

    /**
     * Constrói os pilares decorativos com anéis de energia e painéis piscantes de Quake III.
     */
    buildPillars() {
        const colGeo = new THREE.CylinderGeometry(2.5, 3.2, 10.0, 16);
        const colMat = new THREE.MeshStandardMaterial({
            color: 0x0c121c,
            roughness: 0.88,
            metalness: 0.15
        });

        // Geometrias compartilhadas dos anéis de sanca e painéis piscantes
        const ringGeoLower = new THREE.CylinderGeometry(3.08, 3.12, 0.12, 16, 1, true);
        const ringGeoMid = new THREE.CylinderGeometry(2.82, 2.85, 0.14, 16, 1, true);
        const ringGeoUpper = new THREE.CylinderGeometry(2.55, 2.58, 0.12, 16, 1, true);

        const verticalPanelGeo = new THREE.BoxGeometry(0.18, 4.2, 0.04);
        const baseSkirtGeo = new THREE.TorusGeometry(3.3, 0.08, 8, 24);
        baseSkirtGeo.rotateX(Math.PI / 2);

        this.pillarLayout.forEach((p, idx) => {
            const oy = this.getBaseGroundMeshHeight(p.x, p.z);
            const pGroup = new THREE.Group();
            pGroup.position.set(p.x, oy + 5.0, p.z);

            // 1. Corpo principal do pilar
            const col = new THREE.Mesh(colGeo, colMat);
            col.castShadow = false; // Sombra exclusiva da HX
            col.receiveShadow = true;
            pGroup.add(col);
            this.aimTargetableMeshes.push(col);

            // 2. Anel de Rodapé no Solo (Sanca de Piso Circular)
            const baseSkirt = new THREE.Mesh(baseSkirtGeo, this.coveCyanMat);
            baseSkirt.position.y = -4.92;
            pGroup.add(baseSkirt);

            // 3. Anéis de Energia Horizontais Emissivos
            const ring1 = new THREE.Mesh(ringGeoLower, this.coveCyanMat);
            ring1.position.y = -3.2;
            pGroup.add(ring1);

            const ring2 = new THREE.Mesh(ringGeoMid, this.coveAmberMat);
            ring2.position.y = 0.4;
            pGroup.add(ring2);

            const ring3 = new THREE.Mesh(ringGeoUpper, this.coveCyanMat);
            ring3.position.y = 3.6;
            pGroup.add(ring3);

            // 4. Painéis Verticais Piscantes de Status (Estilo Consoles / Luzes Quake III)
            const panelRadius = 2.84;
            for (let a = 0; a < 4; a++) {
                const angle = (a * Math.PI * 0.5) + 0.35;
                const panelMat = (a % 2 === 0) ? this.blinkingPanelMatA : this.blinkingPanelMatB;
                const panelMesh = new THREE.Mesh(verticalPanelGeo, panelMat);
                panelMesh.position.set(Math.cos(angle) * panelRadius, 0.2, Math.sin(angle) * panelRadius);
                panelMesh.rotation.y = -angle + Math.PI / 2;
                pGroup.add(panelMesh);
            }

            // 5. Luz suave em pilares selecionados
            if (idx % 3 === 0) {
                const pLight = new THREE.PointLight(
                    (idx % 2 === 0) ? 0x00f0ff : 0xff9900,
                    1.4,
                    18.0
                );
                pLight.position.set(0, -2.5, 0);
                pLight.castShadow = false;
                pGroup.add(pLight);
            }

            this.decorativePillars.push(pGroup);
            this.pillarsData.push({ x: p.x, z: p.z, radius: p.radius });
            this.arenaGroup.add(pGroup);
        });
    }

    /**
     * Adiciona uma grade tática escura sobre o solo.
     */
    buildGridHelper() {
        this.gridHelper = new THREE.GridHelper(280, 70, 0x0a101d, 0x04070d);
        this.gridHelper.position.y = 0.04;
        this.arenaGroup.add(this.gridHelper);
    }

    /**
     * Atualiza as animações de pulso das sancas, rodapés e painéis piscantes de Quake 3.
     * @param {number} dt Delta time em segundos
     * @param {number} elapsedTime Tempo total decorrido em segundos
     */
    update(dt, elapsedTime) {
        if (!this.coveCyanMat) return;

        // 1. Pulso suave das Sancas Ciano (Onda contínua)
        const pulseCyan = 0.70 + Math.sin(elapsedTime * 2.8) * 0.30;
        this.coveCyanMat.opacity = pulseCyan;

        // 2. Pulso das Sancas Âmbar (Frequência alternada)
        const pulseAmber = 0.65 + Math.cos(elapsedTime * 3.4) * 0.25;
        this.coveAmberMat.opacity = pulseAmber;

        // 3. Painéis Piscantes Quake III — Tipo A (Strobe tático)
        const strobe = Math.sin(elapsedTime * 7.5);
        const blinkA = (strobe > 0.15) ? 0.95 : (strobe > -0.4 ? 0.35 : 0.08);
        this.blinkingPanelMatA.opacity = blinkA;

        // 4. Painéis Piscantes Quake III — Tipo B (Flicker digital e pulso rápido)
        const flicker = (Math.sin(elapsedTime * 12.0) * 0.5 + Math.cos(elapsedTime * 19.0) * 0.5);
        const blinkB = THREE.MathUtils.clamp(0.50 + flicker * 0.45, 0.12, 0.95);
        this.blinkingPanelMatB.opacity = blinkB;
    }

    /**
     * Atualiza a escala de relevo do terreno e reposiciona caixas e pilares dinamicamente.
     * @param {number} newScale Multiplicador de relevo (ex: 1.20)
     */
    updateReliefScale(newScale) {
        this.currentTerrainReliefScale = newScale;

        // Recalcular alturas base de cada caixa
        this.steppableBoxes.forEach((b) => {
            b.baseY = this.getBaseGroundMeshHeight(b.x, b.z);
            b.topY = b.baseY + b.height;
            if (b.groupMesh) {
                b.groupMesh.position.y = b.baseY + b.height * 0.5;
            }
        });

        // Recalcular vértices da malha do terreno
        const pAttr = this.terrainGeo.attributes.position;
        for (let i = 0; i < pAttr.count; i++) {
            const px = pAttr.getX(i);
            const pz = pAttr.getZ(i);
            pAttr.setY(i, this.getBaseGroundMeshHeight(px, pz));
        }
        pAttr.needsUpdate = true;
        this.terrainGeo.computeVertexNormals();

        // Recalcular colunas
        this.decorativePillars.forEach((colGroup, idx) => {
            const p = this.pillarLayout[idx];
            if (p) colGroup.position.y = this.getBaseGroundMeshHeight(p.x, p.z) + 5.0;
        });
    }
}
