/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — HUDCONTROLLER.JS
 * Controlador de Interface Tática (HUD), Telemetria, Sliders e Modais
 * ============================================================================
 * Responsável por:
 * 1. Bússola Tática 360° com Rumo Cardeal (N, NE, L, SE, S, SO, O, NO).
 * 2. Indicadores do Ciclo de Marcha Tripé (Leds Stance/Swing para as 6 patas).
 * 3. Sincronização e Two-Way Binding dos Sliders (Abertura, Altura, Velocidade, Pivô, Relevo, Pitch e Zoom).
 * 4. Alternância de Painéis (Tecla P), Modo Raio-X (Tecla X / Botão) e Modal de Ajuda (Tecla H).
 */

import * as THREE from 'three';

export class HUDController {
    /**
     * @param {import('../core/EventBus.js').EventBus} eventBus Barramento de eventos
     * @param {import('../bot/HexaBot.js').HexaBot} bot Instância do robô
     * @param {import('../world/TerrainArena.js').TerrainArena} arena Instância da arena
     */
    constructor(eventBus, bot, arena) {
        this.eventBus = eventBus;
        this.bot = bot;
        this.arena = arena;

        // Elementos DOM de Telemetria
        this.compassElem = document.getElementById('compass-val');
        this.gaitStateTextElem = document.getElementById('gait-state-text');
        this.helpModalElem = document.getElementById('help-modal');
        this.btnCloseModalElem = document.getElementById('btn-close-modal');
        this.btnXrayElem = document.getElementById('btn-xray');

        // Sliders e Labels
        this.sliders = {
            spread: document.getElementById('slider-spread'),
            height: document.getElementById('slider-height'),
            moveSpeed: document.getElementById('slider-move-speed'),
            pivotSpeed: document.getElementById('slider-pivot-speed'),
            relief: document.getElementById('slider-relief'),
            pitch: document.getElementById('slider-pitch'),
            zoom: document.getElementById('slider-zoom')
        };

        this.labels = {
            spread: document.getElementById('lbl-spread'),
            height: document.getElementById('lbl-height'),
            moveSpeed: document.getElementById('lbl-move-speed'),
            pivotSpeed: document.getElementById('lbl-pivot-speed'),
            relief: document.getElementById('lbl-relief'),
            pitch: document.getElementById('lbl-pitch'),
            zoom: document.getElementById('lbl-zoom')
        };

        // Inicializar ouvintes
        this.bindSliderEvents();
        this.bindUIButtons();
        this.bindEventBusListeners();
    }

    /**
     * Registra eventos nos sliders de ajuste fino.
     */
    bindSliderEvents() {
        if (this.sliders.spread) {
            this.sliders.spread.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.bot.walkerState.stanceSpread = val;
                if (this.labels.spread) this.labels.spread.innerText = `${val.toFixed(2)}x`;
                this.bot.updateAllLegNominalOffsets((x, z) => this.arena.getTerrainHeight(x, z));
            });
        }

        if (this.sliders.height) {
            this.sliders.height.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.bot.walkerState.bodyHeight = val;
                if (this.labels.height) this.labels.height.innerText = `${val.toFixed(2)}m`;
                this.bot.updateAllLegNominalOffsets((x, z) => this.arena.getTerrainHeight(x, z));
            });
        }

        if (this.sliders.moveSpeed) {
            this.sliders.moveSpeed.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.bot.walkerState.moveSpeed = val;
                if (this.labels.moveSpeed) this.labels.moveSpeed.innerText = `${val.toFixed(1)} m/s`;
            });
        }

        if (this.sliders.pivotSpeed) {
            this.sliders.pivotSpeed.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.bot.walkerState.pivotSpeed = val;
                if (this.labels.pivotSpeed) this.labels.pivotSpeed.innerText = `${val.toFixed(1)}x`;
            });
        }

        if (this.sliders.relief) {
            this.sliders.relief.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.arena.updateReliefScale(val);
                this.bot.walkerState.terrainRelief = val;
                if (this.labels.relief) this.labels.relief.innerText = `${val.toFixed(2)}x`;
                this.bot.updateAllLegNominalOffsets((x, z) => this.arena.getTerrainHeight(x, z));
            });
        }

        if (this.sliders.pitch) {
            this.sliders.pitch.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.bot.walkerState.camPitchDeg = val;
                if (this.labels.pitch) this.labels.pitch.innerText = `${val.toFixed(1)}°`;
            });
        }

        if (this.sliders.zoom) {
            this.sliders.zoom.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.bot.walkerState.camDistance = val;
                if (this.labels.zoom) this.labels.zoom.innerText = `${Math.round(val)}m`;
            });
        }
    }

    /**
     * Vincula botões da interface.
     */
    bindUIButtons() {
        if (this.btnXrayElem) {
            this.btnXrayElem.addEventListener('click', () => {
                this.eventBus.emit('bot:toggleXRay');
            });
        }

        if (this.btnCloseModalElem && this.helpModalElem) {
            this.btnCloseModalElem.addEventListener('click', () => {
                this.helpModalElem.classList.remove('active');
            });
        }
    }

    /**
     * Vincula listeners de telemetria e notificações de estado via EventBus.
     */
    bindEventBusListeners() {
        // Alternar modo HUD oculto
        this.eventBus.on('ui:togglePanels', () => {
            document.body.classList.toggle('hud-hidden');
        });

        // Alternar modal de ajuda
        this.eventBus.on('ui:toggleHelp', () => {
            if (this.helpModalElem) {
                this.helpModalElem.classList.toggle('active');
            }
        });

        // Atualização visual do botão Raio-X
        this.eventBus.on('bot:xrayChanged', (xrayMode) => {
            if (this.btnXrayElem) {
                this.btnXrayElem.style.borderColor = xrayMode ? '#38bdf8' : 'rgba(255,255,255,0.2)';
                this.btnXrayElem.style.color = xrayMode ? '#38bdf8' : '#94a3b8';
            }
        });

        // Atualização dos sliders quando um novo modelo é carregado
        this.eventBus.on('bot:modelLoaded', ({ bodyHeight, stanceSpread, canonicalRatio }) => {
            if (this.sliders.height) {
                this.sliders.height.min = '0.10';
                this.sliders.height.max = (canonicalRatio > 1.2) ? '3.80' : '2.50';
                this.sliders.height.value = bodyHeight.toFixed(2);
            }
            if (this.labels.height) this.labels.height.innerText = `${bodyHeight.toFixed(2)}m`;

            if (this.sliders.spread) this.sliders.spread.value = stanceSpread.toFixed(2);
            if (this.labels.spread) this.labels.spread.innerText = `${stanceSpread.toFixed(2)}x`;
        });

        // Sincronização ao girar câmera com o mouse
        this.eventBus.on('camera:orbit', () => {
            if (this.sliders.pitch) this.sliders.pitch.value = this.bot.walkerState.camPitchDeg.toFixed(1);
            if (this.labels.pitch) this.labels.pitch.innerText = `${this.bot.walkerState.camPitchDeg.toFixed(1)}°`;
        });

        // Sincronização ao alterar zoom com a roda do mouse
        this.eventBus.on('camera:zoom', () => {
            if (this.sliders.zoom) this.sliders.zoom.value = Math.round(this.bot.walkerState.camDistance);
            if (this.labels.zoom) this.labels.zoom.innerText = `${Math.round(this.bot.walkerState.camDistance)}m`;
        });

        // Atualização contínua de telemetria a cada frame
        this.eventBus.on('bot:telemetry', ({ walkerState, effectiveMoveSpeed, swayWeight, legs }) => {
            this.updateTelemetry(walkerState, effectiveMoveSpeed, swayWeight, legs);
        });
    }

    /**
     * Atualiza a bússola e os indicadores de marcha a cada frame.
     */
    updateTelemetry(walkerState, effectiveMoveSpeed, swayWeight, legs) {
        // 1. Atualizar Bússola 360°
        const currentRobotHeading = walkerState.isMoving
            ? (walkerState.travelHeading || 0)
            : ((walkerState.baseHeading || 0) + (walkerState.torsoYaw || 0));

        const rawDeg = THREE.MathUtils.radToDeg(currentRobotHeading || 0);
        const normalizedDeg = ((Math.round(rawDeg) % 360) + 360) % 360;
        const safeDeg = isNaN(normalizedDeg) ? 0 : normalizedDeg;

        const directions = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
        const dirIndex = Math.floor(((safeDeg + 22.5) % 360) / 45);
        const safeDir = directions[dirIndex] || 'N';

        if (this.compassElem) {
            this.compassElem.innerText = `${String(safeDeg).padStart(3, '0')}° ${safeDir}`;
        }

        // 2. Atualizar Texto do Estado de Marcha
        const wantsMove = walkerState.isMoving;
        const isGaitActive = wantsMove || walkerState.isTurningInPlace || this.bot.gait.isStepActive;

        if (this.gaitStateTextElem) {
            this.gaitStateTextElem.innerText = isGaitActive
                ? (wantsMove ? `AVANÇANDO (${effectiveMoveSpeed.toFixed(1)} m/s)` : 'PIVÔ NO PRÓPRIO EIXO')
                : (swayWeight > 0.35 ? 'ESTÁTICO (AUTO-BALANÇO / REPOUSO)' : 'ESTÁTICO (ZONA DE CONFORTO)');
        }

        // 3. Atualizar Indicadores Leds das Pernas (Stance vs Swing)
        const activeGroup = this.bot.gait.activeTripodGroup;
        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            const legDot = document.getElementById(`dot-${leg.id}`);
            if (legDot) {
                const isSwing = isGaitActive && (leg.group === activeGroup);
                legDot.className = isSwing ? 'leg-dot swing' : 'leg-dot stance';
            }
        }
    }
}
