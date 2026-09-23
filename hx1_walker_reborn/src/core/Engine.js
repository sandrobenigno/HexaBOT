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
            500
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
     * @param {THREE.Vector3} targetPos Posição central do robô no mundo
     * @param {number} bodyHeight Altura atual do corpo
     * @param {number} camAzimuth Ângulo azimute da câmera (radianos)
     * @param {number} camPitchDeg Ângulo de inclinação da câmera (graus)
     * @param {number} camDistance Distância da câmera ao robô (metros)
     */
    updateTacticalCamera(targetPos, bodyHeight, camAzimuth, camPitchDeg, camDistance) {
        const pitchRad = THREE.MathUtils.degToRad(camPitchDeg);
        const camDistH = camDistance * Math.cos(pitchRad);
        const camDistV = camDistance * Math.sin(pitchRad);

        const camTargetX = targetPos.x;
        const camTargetY = targetPos.y + bodyHeight * 0.7;
        const camTargetZ = targetPos.z;

        const desiredCamX = camTargetX + Math.sin(camAzimuth) * camDistH;
        const desiredCamY = camTargetY + camDistV;
        const desiredCamZ = camTargetZ + Math.cos(camAzimuth) * camDistH;

        this.camera.position.set(desiredCamX, desiredCamY, desiredCamZ);
        this.camera.lookAt(camTargetX, camTargetY, camTargetZ);

        // Atualizar Fog dinâmico ancorado na distância da câmera
        this.scene.fog.near = Math.max(10.0, camDistance - 30.0);
        this.scene.fog.far = camDistance + 150.0;
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
