/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — ENGINE.JS
 * Gerenciador de Cena, Renderização, Câmera Orbital, IBL e Iluminação Luar
 * ============================================================================
 * Centraliza a infraestrutura gráfica Three.js:
 * - Cena com Fog dinâmico adaptativo ancorado na câmera
 * - Câmera perspectiva tática com rotação orbital e zoom clamp (50m a 100m)
 * - Renderer WebGL com PCFShadowMap de alta fidelidade e ACESFilmicToneMapping
 * - Ambiente IBL (RoomEnvironment) para reflexos metálicos realistas
 * - Iluminação direcional (Luar) com frustum otimizado em torno do mecha
 * - Loop principal de animação com delta-time estável
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class Engine {
    /**
     * @param {HTMLElement} containerElement Elemento DOM que receberá o Canvas WebGL
     */
    constructor(containerElement) {
        this.container = containerElement;

        // 1. Instanciar Cena e Fog Adaptativo
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x020306);
        // Fog calibrado para manter a densidade perfeita de 60m em qualquer zoom
        this.scene.fog = new THREE.Fog(0x020306, 30.0, 210.0);

        // 2. Câmera Perspectiva Tática
        this.camera = new THREE.PerspectiveCamera(
            45,
            window.innerWidth / window.innerHeight,
            0.5,
            800
        );
        this.camera.position.set(0, 35, 40);

        // 3. Renderer WebGL de Alta Performance
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap; // Sombra nítida e bem marcada
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.85;
        this.container.appendChild(this.renderer.domElement);

        // 4. IBL (Image-Based Lighting) com RoomEnvironment
        this.setupIBL();

        // 5. Sistema de Luzes (Luar Direcional + Sombras + Luzes de Borda)
        this.setupLighting();

        // 6. Controle de Tempo e Game Loop
        this.clock = new THREE.Clock();
        this.totalElapsedTime = 0;
        this.updateCallbacks = [];
        this.isRunning = false;

        // 7. Evento de Redimensionamento da Janela
        this.boundOnResize = this.onWindowResize.bind(this);
        window.addEventListener('resize', this.boundOnResize);

        // 8. Amortecimento da Câmera Adaptativa (Elevação & Zoom-out Dinâmicos)
        this.adaptivePitch = 0.0;
        this.adaptiveDist = 0.0;
        this.adaptiveHeight = 0.0;
    }

    /**
     * Inicializa o mapa de reflexão IBL para garantir brilho especular e metálico no chassi.
     */
    setupIBL() {
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();
        const roomEnv = new RoomEnvironment();
        this.scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    }

    /**
     * Configura o sistema equilibrado de iluminação:
     * - Luz ambiente sutil
     * - Luar direcional potente com sombras projetadas
     * - Luzes de borda distantes (Rim lights) em Ciano e Vermelho
     */
    setupLighting() {
        // Luz Ambiente
        this.ambientLight = new THREE.AmbientLight(0x0a1220, 0.04);
        this.scene.add(this.ambientLight);

        // Vetor Direcional Fixo do Luar (Direção e Ângulo Imutáveis no Mundo)
        this.sunLightDirOffset = new THREE.Vector3(38, 70, 32);

        // Luar Direcional Potente
        this.sunLight = new THREE.DirectionalLight(0x8faecf, 2.60);
        this.sunLight.position.copy(this.sunLightDirOffset);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 10.0;
        this.sunLight.shadow.camera.far = 180.0;

        // Frustum Focado em torno da Aranha (Raio de ~22m = Máxima Densidade de Pixels)
        const shadowBound = 22.0;
        this.sunLight.shadow.camera.left = -shadowBound;
        this.sunLight.shadow.camera.right = shadowBound;
        this.sunLight.shadow.camera.top = shadowBound;
        this.sunLight.shadow.camera.bottom = -shadowBound;
        this.sunLight.shadow.bias = -0.0001;
        this.sunLight.shadow.normalBias = 0.0; // Sem deslocamento: contato perfeito das patas no solo
        this.sunLight.shadow.camera.updateProjectionMatrix();

        this.scene.add(this.sunLight);
        this.scene.add(this.sunLight.target);

        // Luzes de Borda Suaves e Distantes
        this.rimLightBlue = new THREE.PointLight(0x00d2ff, 1.5, 45);
        this.rimLightBlue.position.set(-55, 15, -45);
        this.scene.add(this.rimLightBlue);

        this.rimLightRed = new THREE.PointLight(0xff0044, 1.2, 45);
        this.rimLightRed.position.set(55, 15, -45);
        this.scene.add(this.rimLightRed);
    }

    /**
     * Registra uma função de callback para ser executada a cada frame no game loop.
     * @param {Function} callback Recebe (dt, elapsedTime)
     */
    registerUpdate(callback) {
        this.updateCallbacks.push(callback);
    }

    /**
     * Inicia o ciclo de renderização (Game Loop).
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.clock.start();

        const loop = () => {
            if (!this.isRunning) return;
            requestAnimationFrame(loop);

            const dt = Math.min(this.clock.getDelta(), 0.1);
            this.totalElapsedTime += dt;

            // Executar todos os callbacks registrados
            for (let i = 0; i < this.updateCallbacks.length; i++) {
                this.updateCallbacks[i](dt, this.totalElapsedTime);
            }

            // Renderizar a cena
            this.renderer.render(this.scene, this.camera);
        };

        requestAnimationFrame(loop);
    }

    /**
     * Pausa o ciclo de renderização.
     */
    stop() {
        this.isRunning = false;
        this.clock.stop();
    }

    /**
     * Atualiza a posição e orientação da câmera tática orbital em torno do alvo.
     * Inclui elevação adaptativa automática e zoom-out suave ao aproximar-se dos blocos de borda,
     * mantendo o foco absoluto no robô sem desencaixar o enquadramento.
     * @param {THREE.Vector3} targetPos Posição central do robô no mundo
     * @param {number} bodyHeight Altura atual do corpo
     * @param {number} camAzimuth Ângulo azimute da câmera (radianos)
     * @param {number} camPitchDeg Ângulo de inclinação da câmera (graus)
     * @param {number} camDistance Distância da câmera ao robô (metros)
     * @param {number} [dt=0.016] Delta time em segundos
     * @param {Object} [terrainArena=null] Instância de TerrainArena para detecção de obstáculos perimétricos
     */
    updateTacticalCamera(targetPos, bodyHeight, camAzimuth, camPitchDeg, camDistance, dt = 0.016, terrainArena = null) {
        const pitchRad = THREE.MathUtils.degToRad(camPitchDeg);
        const camDistH = camDistance * Math.cos(pitchRad);
        const camDistV = camDistance * Math.sin(pitchRad);

        const camTargetX = targetPos.x;
        const camTargetY = targetPos.y + bodyHeight * 0.7;
        const camTargetZ = targetPos.z;

        const baseCamX = camTargetX + Math.sin(camAzimuth) * camDistH;
        const baseCamY = camTargetY + camDistV;
        const baseCamZ = camTargetZ + Math.cos(camAzimuth) * camDistH;

        let maxNeededLift = 0.0;

        // 1. Proximidade geral dos limites da arena (anel de monólitos a R ~ 122m)
        const rCam = Math.sqrt(baseCamX * baseCamX + baseCamZ * baseCamZ);
        const rBot = Math.sqrt(camTargetX * camTargetX + camTargetZ * camTargetZ);
        const rMax = Math.max(rCam - 75.0, rBot - 60.0);
        if (rMax > 0.0) {
            const fRadius = THREE.MathUtils.clamp(rMax / 45.0, 0.0, 1.0);
            maxNeededLift = Math.max(maxNeededLift, fRadius * 24.0);
        }

        // 2. Interseção com monólitos e elevação sobre os blocos de fortaleza
        if (terrainArena && terrainArena.boundaryBlocks && terrainArena.boundaryBlocks.length > 0) {
            const rayDx = camTargetX - baseCamX;
            const rayDz = camTargetZ - baseCamZ;
            const rayLen2D = Math.sqrt(rayDx * rayDx + rayDz * rayDz);
            const uRayX = (rayLen2D > 0.001) ? (rayDx / rayLen2D) : 0;
            const uRayZ = (rayLen2D > 0.001) ? (rayDz / rayLen2D) : 0;

            for (let i = 0; i < terrainArena.boundaryBlocks.length; i++) {
                const b = terrainArena.boundaryBlocks[i];
                const bTopY = b.baseY + b.height + 4.0; // Topo com margem de segurança

                // Distância da câmera ao centro do bloco
                const toCamX = baseCamX - b.x;
                const toCamZ = baseCamZ - b.z;
                const distCam = Math.sqrt(toCamX * toCamX + toCamZ * toCamZ);

                // Proximidade direta da câmera
                if (distCam < 38.0) {
                    const fProx = 1.0 - (distCam / 38.0);
                    const liftDirect = Math.max(0.0, bTopY + 8.0 - baseCamY);
                    maxNeededLift = Math.max(maxNeededLift, liftDirect * fProx);
                }

                // Teste de raio entre câmera e robô
                if (rayLen2D > 0.001) {
                    const toBlockX = b.x - baseCamX;
                    const toBlockZ = b.z - baseCamZ;
                    const projT = toBlockX * uRayX + toBlockZ * uRayZ;
                    const s = projT / rayLen2D;

                    if (s > -0.10 && s < 1.05) {
                        const closeX = baseCamX + projT * uRayX;
                        const closeZ = baseCamZ + projT * uRayZ;
                        const distRay = Math.sqrt((b.x - closeX) * (b.x - closeX) + (b.z - closeZ) * (b.z - closeZ));
                        const rInfl = Math.max(b.width, b.depth) * 0.75 + 10.0;

                        if (distRay < rInfl) {
                            const fRay = 1.0 - (distRay / rInfl);
                            const sClamp = THREE.MathUtils.clamp(s, 0.05, 0.85);
                            const reqCamY = (bTopY + 6.0 - sClamp * camTargetY) / (1.0 - sClamp);
                            const liftRay = Math.max(0.0, reqCamY - baseCamY);
                            maxNeededLift = Math.max(maxNeededLift, liftRay * fRay);
                        }
                    }
                }
            }
        }

        const targetLiftY = maxNeededLift;
        const targetExtraPitch = THREE.MathUtils.clamp(targetLiftY * 1.1, 0.0, 32.0); // Eleva pitch até ~57°
        const targetExtraDist = THREE.MathUtils.clamp(targetLiftY * 0.9, 0.0, 35.0); // Dá zoom-out até ~85m

        // Interpolação suave e contínua (smooth damping)
        const dampFactor = 5.5;
        this.adaptiveHeight = THREE.MathUtils.damp(this.adaptiveHeight, targetLiftY, dampFactor, dt);
        this.adaptivePitch = THREE.MathUtils.damp(this.adaptivePitch, targetExtraPitch, dampFactor, dt);
        this.adaptiveDist = THREE.MathUtils.damp(this.adaptiveDist, targetExtraDist, dampFactor, dt);

        // Calcular posição candidata da câmera adaptada
        const effPitchRad = THREE.MathUtils.degToRad(camPitchDeg + this.adaptivePitch);
        const effDist = camDistance + this.adaptiveDist;
        const effDistH = effDist * Math.cos(effPitchRad);
        const effDistV = effDist * Math.sin(effPitchRad) + this.adaptiveHeight;

        const rawCamX = camTargetX + Math.sin(camAzimuth) * effDistH;
        const rawCamY = camTargetY + effDistV;
        const rawCamZ = camTargetZ + Math.cos(camAzimuth) * effDistH;

        // 3. Trava de Contenção do Domo (Impede que a câmera ultrapasse ou atravesse a abóbada)
        const domeCenterY = -2.5;
        const domeMaxRadius = 148.0;
        const safeClearance = 6.5; // Margem de segurança de 6.5m abaixo do teto/parede
        const maxSafeDist = domeMaxRadius - safeClearance; // 141.5m

        const dxDome = rawCamX;
        const dyDome = rawCamY - domeCenterY;
        const dzDome = rawCamZ;
        const distFromDome = Math.sqrt(dxDome * dxDome + dyDome * dyDome + dzDome * dzDome);

        let finalCamX = rawCamX;
        let finalCamY = rawCamY;
        let finalCamZ = rawCamZ;

        if (distFromDome > maxSafeDist) {
            const clampRatio = maxSafeDist / distFromDome;
            finalCamX = dxDome * clampRatio;
            finalCamY = domeCenterY + dyDome * clampRatio;
            finalCamZ = dzDome * clampRatio;
        }

        // Piso mínimo de segurança para a câmera
        finalCamY = Math.max(finalCamY, 2.5);

        this.camera.position.set(finalCamX, finalCamY, finalCamZ);
        this.camera.lookAt(camTargetX, camTargetY, camTargetZ);

        // Atualizar Fog dinâmico calibrado para manter o domo visível e nítido
        this.scene.fog.near = Math.max(10.0, effDist - 30.0);
        this.scene.fog.far = Math.max(180.0, effDist + 160.0);
    }

    /**
     * Atualiza o foco de sombra e a posição do luar para acompanhar a aranha no mundo.
     * @param {THREE.Vector3} targetPos Posição do robô
     * @param {number} bodyHeight Altura do robô
     */
    updateSunLight(targetPos, bodyHeight) {
        this.sunLight.target.position.set(
            targetPos.x,
            targetPos.y + bodyHeight * 0.5,
            targetPos.z
        );
        this.sunLight.position.set(
            targetPos.x + this.sunLightDirOffset.x,
            targetPos.y + this.sunLightDirOffset.y,
            targetPos.z + this.sunLightDirOffset.z
        );
        this.sunLight.target.updateMatrixWorld(true);
        this.sunLight.updateMatrixWorld(true);
    }

    /**
     * Trata o redimensionamento da janela do navegador.
     */
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /**
     * Destrói os recursos alocados pelo Three.js ao encerrar.
     */
    dispose() {
        this.stop();
        window.removeEventListener('resize', this.boundOnResize);
        if (this.renderer.domElement && this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
        this.renderer.dispose();
    }
}
