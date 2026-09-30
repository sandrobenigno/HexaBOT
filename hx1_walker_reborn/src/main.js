/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — MAIN.JS
 * Ponto de Entrada e Orquestrador Central da Aplicação Modular
 * ============================================================================
 * Conecta todos os subsistemas da arquitetura:
 * - Engine Gráfico (Three.js, IBL, Iluminação de Ruínas e Render Loop)
 * - Barramento de Eventos (EventBus)
 * - Gerenciador de Entradas (InputManager)
 * - Arena de Terreno Procedural (TerrainArena)
 * - Sistema de Colisões (CollisionSystem)
 * - Controlador da Criatura (HexaBot)
 * - Interface do Usuário (HUDController & ModelLoaderUI)
 */

import { Engine } from './core/Engine.js';
import { globalEventBus } from './core/EventBus.js';
import { InputManager } from './core/InputManager.js';
import { TerrainArena } from './world/TerrainArena.js';
import { CollisionSystem } from './world/CollisionSystem.js';
import { HexaBot } from './bot/HexaBot.js';
import { EnemyManager } from './combat/EnemyManager.js';
import { TribalFX } from './combat/TribalFX.js';
import { VictoryFX } from './combat/VictoryFX.js';
import { SuperchargeManager } from './combat/SuperchargeManager.js';
import { SoundManager } from './audio/SoundManager.js';
import { HUDController } from './ui/HUDController.js';
import { ModelLoaderUI } from './ui/ModelLoaderUI.js';

// Função de inicialização ao carregar o DOM
function initApp() {
    const container = document.getElementById('canvas-container');
    if (!container) {
        console.error('[HexaBOT] Elemento #canvas-container não encontrado!');
        return;
    }

    // 1. Inicializar Motor Gráfico
    const engine = new Engine(container);

    // 2. Construir Arena Procedural
    const terrainArena = new TerrainArena(engine.scene);

    // 3. Inicializar Sistema de Restrições e Colisões
    const collisionSystem = new CollisionSystem(terrainArena.pillarsData);

    // Referência de câmera na cena para facilitar raycasting
    engine.scene.__camera = engine.camera;

    // 4. Inicializar Gerenciador de Entradas (Teclado, Mouse, Zoom e Inatividade)
    const inputManager = new InputManager(window, globalEventBus);

    // 5. Inicializar Gerenciador de Áudio Espacial e Efeitos Sonoros
    const soundManager = new SoundManager(engine.camera, engine.scene, globalEventBus);

    // 6. Instanciar Gerenciador de Inimigos (Spawners, Joaninhas e Bombas)
    const enemyManager = new EnemyManager(engine.scene, globalEventBus, terrainArena);

    // 7. Instanciar Gerador de Efeitos de Fogo, Fumaça e Iluminação Tribal
    const tribalFX = new TribalFX(engine.scene, globalEventBus);

    // 8. Instanciar Gerador de Confetes e Luz Festiva da Dança da Vitória
    const victoryFX = new VictoryFX(engine.scene, globalEventBus);

    // 8.1 Instanciar Gerenciador de Esferas de Supercharge
    const superchargeManager = new SuperchargeManager(engine.scene, globalEventBus, terrainArena);

    // 9. Instanciar Controlador do Hexápode
    const hexaBot = new HexaBot(engine.scene, globalEventBus);

    // 10. Inicializar Controladores de Interface (HUD e Carregador de Modelos)
    const hudController = new HUDController(globalEventBus, hexaBot, terrainArena);
    const modelLoader = new ModelLoaderUI(hexaBot, terrainArena);

    // Estado Geral da Missão e Pausa
    let isGameStarted = false;
    let isManualPaused = false;
    let isHelpOpen = false;

    // Resetar inimigos quando o robô for resetado ou avançar de fase após vitória
    globalEventBus.on('bot:resetPosition', () => {
        isManualPaused = false;
        enemyManager.reset();
        globalEventBus.emit('game:pauseStateChanged', false);
    });

    globalEventBus.on('combat:continue', () => {
        isManualPaused = false;
        enemyManager.reset();
        globalEventBus.emit('game:pauseStateChanged', false);
    });

    // Início da Partida (quando o jogador clica em INICIAR MISSÃO)
    globalEventBus.on('game:start', () => {
        isGameStarted = true;
        isManualPaused = false;
    });

    // Alternar Pausa Manual com a Tecla P
    globalEventBus.on('game:togglePause', () => {
        if (!isGameStarted || isHelpOpen) return;
        isManualPaused = !isManualPaused;
        globalEventBus.emit('game:pauseStateChanged', isManualPaused, 'manual');
    });

    // Notificação de Abertura/Fechamento do Modal de Ajuda
    globalEventBus.on('ui:helpStateChanged', (isOpen) => {
        isHelpOpen = !!isOpen;
        const effectivePaused = isManualPaused || isHelpOpen;
        globalEventBus.emit('game:pauseStateChanged', effectivePaused, isHelpOpen ? 'help' : 'manual');
    });

    // Alternar restrição de colisão com pilares/obstáculos
    globalEventBus.on('collision:toggleObstacles', (enabled) => {
        collisionSystem.enableObstacles = enabled;
    });

    // 11. Registrar Loop de Atualização no Game Loop do Engine
    engine.registerUpdate((dt, elapsedTime) => {
        const isSimulationRunning = isGameStarted && !isManualPaused && !isHelpOpen;

        if (isSimulationRunning) {
            // Atualizar robô (locomoção, pivô, IK, combate, shapekeys e dano)
            hexaBot.update(dt, elapsedTime, inputManager, collisionSystem, terrainArena, enemyManager);

            // Atualizar animações de sancas e painéis de luz da arena
            terrainArena.update(dt, elapsedTime);

            // Atualizar orquestrador de inimigos, cabines e bombas
            enemyManager.update(dt, elapsedTime, hexaBot.robotMasterGroup.position, hexaBot.isDead);

            // Atualizar esfera de plasma Supercharge nas torres e coleta
            superchargeManager.update(dt, elapsedTime, hexaBot.robotMasterGroup.position, inputManager.raycaster);

            // Atualizar efeitos visuais de fogo, fumaça e fogueira tribal
            tribalFX.update(dt, elapsedTime, hexaBot.robotMasterGroup.position, (x, z) => terrainArena.getTerrainHeight(x, z));

            // Atualizar partículas de confetes da vitória
            victoryFX.update(dt, elapsedTime, hexaBot.robotMasterGroup.position, (x, z) => terrainArena.getTerrainHeight(x, z));
        }

        // Câmera tática e iluminação continuam responsivas para inspeção mesmo em pausa
        engine.updateTacticalCamera(
            hexaBot.robotMasterGroup.position,
            hexaBot.walkerState.bodyHeight,
            hexaBot.walkerState.camAzimuth,
            hexaBot.walkerState.camPitchDeg,
            hexaBot.walkerState.camDistance,
            dt,
            terrainArena
        );

        engine.updateSunLight(
            hexaBot.robotMasterGroup.position,
            hexaBot.walkerState.bodyHeight
        );
    });

    // 8. Manter resolução das linhas de esqueleto no redimensionamento da janela
    window.addEventListener('resize', () => {
        hexaBot.legs.forEach((l) => {
            if (l.lineMesh && l.lineMesh.material) {
                l.lineMesh.material.resolution.set(window.innerWidth, window.innerHeight);
            }
        });
    });

    // 9. Carregar Modelo Inicial Padrão: HX2 (Texturizada)
    modelLoader.loadModelPreset('./assets/glb/aranha_texturizada.glb', 'HX2 (Texturizada)');

    // 10. Iniciar Loop de Renderização
    engine.start();

    console.log('🚀 HexaBOT Tactical Engine inicializado com sucesso em arquitetura modular ES6.');
}

// Iniciar aplicação quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
