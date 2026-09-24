/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — INPUTMANAGER.JS
 * Gerenciador Unificado de Entradas de Teclado, Mouse e Raycasting 3D
 * ============================================================================
 * Centraliza:
 * - Leitura das teclas de locomoção (WASD, Setas)
 * - Atalhos táticos (<kbd>P</kbd> Painéis, <kbd>H</kbd> Ajuda, <kbd>R</kbd> Reset)
 * - Raycasting de mira na arena 3D (terreno, cubos pisáveis, colunas)
 * - Órbita da câmera tática via arrasto com o botão do meio (MMB Drag)
 * - Zoom suave via roda do mouse (Scroll Wheel de 50m a 100m)
 * - Cronometragem precisa de inatividade para disparo do Auto-Sway (500ms)
 */

import * as THREE from 'three';
import { globalEventBus } from './EventBus.js';

export class InputManager {
    /**
     * @param {HTMLElement} domElement Elemento de captura de eventos (geralmente window ou container)
     * @param {EventBus} [eventBus=globalEventBus] Barramento de eventos para emitir notificações
     */
    constructor(domElement = window, eventBus = globalEventBus) {
        this.domElement = domElement;
        this.eventBus = eventBus;

        // Estado das teclas de locomoção
        this.keys = {
            KeyW: false,
            KeyS: false,
            KeyA: false,
            KeyD: false,
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false
        };

        // Estado do Mouse
        this.mouseNorm = new THREE.Vector2();
        this.isMouseActive = false;
        this.isAimFiring = false;
        this.isMiddleDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Cronômetro de Inatividade (para disparo do Auto-Sway após 500ms sem comando)
        this.lastInputTime = performance.now() * 0.001;

        // Utilitários de Raycasting
        this.raycaster = new THREE.Raycaster();
        this.aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.tempHitNormal = new THREE.Vector3();
        this.tempGroundHit = new THREE.Vector3();

        // Elemento visual do retículo DOM
        this.crosshairElem = document.getElementById('crosshair');

        // Inicializar ouvintes de eventos
        this.bindEvents();
    }

    /**
     * Vincula todos os ouvintes nativos do DOM.
     */
    bindEvents() {
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));
        window.addEventListener('wheel', (e) => this.onWheel(e), { passive: true });
        window.addEventListener('blur', () => this.onBlur());
    }

    /**
     * Registra atividade do usuário para zerar o temporizador do Auto-Sway.
     */
    markActivity() {
        this.lastInputTime = performance.now() * 0.001;
        this.eventBus.emit('input:activity');
    }

    /**
     * Retorna o tempo em segundos desde a última interação do usuário.
     * @returns {number} Segundos decorridos
     */
    getTimeSinceLastInput() {
        return (performance.now() * 0.001) - this.lastInputTime;
    }

    /**
     * Trata evento de tecla pressionada.
     * @param {KeyboardEvent} e
     */
    onKeyDown(e) {
        if (e.code in this.keys) {
            this.keys[e.code] = true;
            this.markActivity();
        }

        // Atalhos do Sistema
        const keyLower = e.key ? e.key.toLowerCase() : '';
        if (keyLower === 'p' || e.code === 'KeyP') this.eventBus.emit('ui:togglePanels');
        if (keyLower === 'h' || e.code === 'KeyH') this.eventBus.emit('ui:toggleHelp');
        if (keyLower === 'r' || e.code === 'KeyR') this.eventBus.emit('bot:resetPosition');
    }

    /**
     * Trata evento de tecla solta.
     * @param {KeyboardEvent} e
     */
    onKeyUp(e) {
        if (e.code in this.keys) {
            this.keys[e.code] = false;
        }
    }

    /**
     * Trata movimentação do cursor do mouse na tela.
     * @param {MouseEvent} e
     */
    onMouseMove(e) {
        this.isMouseActive = true;
        this.markActivity();

        // Se estiver arrastando com o botão do meio (MMB Drag), rotaciona azimute e pitch da câmera
        if (this.isMiddleDragging) {
            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            this.eventBus.emit('camera:orbit', {
                deltaAzimuth: -deltaX * 0.006,
                deltaPitchDeg: deltaY * 0.1
            });
        }

        // Atualizar coordenadas normalizadas para raycasting Three.js (-1 a +1)
        this.mouseNorm.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouseNorm.y = -(e.clientY / window.innerHeight) * 2 + 1;

        // Posicionar retículo HUD no cursor
        if (this.crosshairElem) {
            this.crosshairElem.style.left = `${e.clientX}px`;
            this.crosshairElem.style.top = `${e.clientY}px`;
        }
    }

    /**
     * Trata cliques do mouse.
     * @param {MouseEvent} e
     */
    onMouseDown(e) {
        this.markActivity();
        if (e.button === 1) { // Botão do meio (Scroll Click): Iniciar órbita livre da câmera
            this.isMiddleDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            e.preventDefault();
        } else if (e.button === 0) { // Botão esquerdo: Disparar laser de plasma
            this.isAimFiring = true;
            this.eventBus.emit('combat:fireStart');
        }
    }

    /**
     * Trata liberação dos botões do mouse.
     * @param {MouseEvent} e
     */
    onMouseUp(e) {
        if (e.button === 1) {
            this.isMiddleDragging = false;
        } else if (e.button === 0) {
            this.isAimFiring = false;
            this.eventBus.emit('combat:fireEnd');
        }
    }

    /**
     * Trata rolagem do scroll do mouse para ajuste de zoom da câmera tática.
     * @param {WheelEvent} e
     */
    onWheel(e) {
        this.markActivity();
        const deltaDist = e.deltaY * 0.04;
        this.eventBus.emit('camera:zoom', deltaDist);
    }

    /**
     * Trata perda de foco da janela.
     */
    onBlur() {
        this.isMiddleDragging = false;
        this.isAimFiring = false;
        for (const k in this.keys) {
            this.keys[k] = false;
        }
    }

    /**
     * Calcula o vetor de movimento relativo (WASD).
     * @returns {{ moveFwd: number, moveSide: number, isMoving: boolean }}
     */
    getMovementVector() {
        let moveFwd = 0;
        let moveSide = 0;
        if (this.keys.KeyW || this.keys.ArrowUp) moveFwd += 1;
        if (this.keys.KeyS || this.keys.ArrowDown) moveFwd -= 1;
        if (this.keys.KeyA || this.keys.ArrowLeft) moveSide += 1;  // Strafe Esquerda
        if (this.keys.KeyD || this.keys.ArrowRight) moveSide -= 1; // Strafe Direita
        return {
            moveFwd,
            moveSide,
            isMoving: (moveFwd !== 0 || moveSide !== 0)
        };
    }

    /**
     * Projeta o raio da câmera sobre a arena (terreno, blocos escaláveis e pilares).
     * @param {THREE.Camera} camera Câmera ativa da cena
     * @param {Array<THREE.Mesh>} targetableMeshes Lista de malhas sólidas interceptáveis
     * @param {Function} getTerrainHeightFn Função analítica getTerrainHeight(x, z)
     * @param {THREE.Vector3} outPoint Vetor onde o ponto de impacto 3D será gravado
     * @param {THREE.Vector3} outNormal Vetor onde a normal da superfície de impacto será gravada
     */
    projectMouseToWorld(camera, targetableMeshes, getTerrainHeightFn, outPoint, outNormal) {
        if (!this.isMouseActive) return;

        this.raycaster.setFromCamera(this.mouseNorm, camera);
        const hits = this.raycaster.intersectObjects(targetableMeshes, false);

        if (hits.length > 0) {
            outPoint.copy(hits[0].point);
            if (hits[0].face) {
                this.tempHitNormal.copy(hits[0].face.normal)
                    .transformDirection(hits[0].object.matrixWorld)
                    .normalize();
                outNormal.copy(this.tempHitNormal);
            } else {
                outNormal.set(0, 1, 0);
            }
        } else {
            const groundHit = this.tempGroundHit;
            const hit = this.raycaster.ray.intersectPlane(this.aimPlane, groundHit);
            if (hit) {
                groundHit.x = THREE.MathUtils.clamp(groundHit.x, -135.0, 135.0);
                groundHit.z = THREE.MathUtils.clamp(groundHit.z, -135.0, 135.0);
                outPoint.copy(groundHit);
                outPoint.y = getTerrainHeightFn(groundHit.x, groundHit.z);
                outNormal.set(0, 1, 0);
            }
        }
    }
}
