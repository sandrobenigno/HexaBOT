/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — MODELLOADERUI.JS
 * Gerenciador de Carregamento de Modelos 3D e Manifestos (.glb / .gltf / .bot.json)
 * ============================================================================
 * Suporta 3 métodos de carregamento integrados:
 * 1. Dropdown de Presets: Modelos calibrados em ../glb/ (HX2 Pernalonga e HX1 Clássica).
 * 2. Botão "📂 Abrir" (File Input): Upload local de qualquer .glb/.gltf ou manifesto .bot.json.
 * 3. Drag & Drop: Arrastar e soltar arquivos diretamente na janela do simulador.
 */

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BotManifest } from '../bot/BotManifest.js';

export class ModelLoaderUI {
    /**
     * @param {import('../bot/HexaBot.js').HexaBot} bot Instância do robô
     * @param {import('../world/TerrainArena.js').TerrainArena} arena Instância da arena
     */
    constructor(bot, arena) {
        this.bot = bot;
        this.arena = arena;
        this.gltfLoader = new GLTFLoader();

        // Elementos DOM
        this.loadingElem = document.getElementById('loading');
        this.modelSelectElem = document.getElementById('model-select');
        this.optCustomElem = document.getElementById('opt-custom');
        this.modelDescElem = document.getElementById('model-desc');
        this.fileInputElem = document.getElementById('glb-file-input');
        this.dropZoneElem = document.getElementById('drop-zone');

        // Inicializar ouvintes
        this.bindEvents();
    }

    /**
     * Exibe o overlay com spinner de carregamento.
     */
    showLoading() {
        if (this.loadingElem) {
            this.loadingElem.style.display = 'flex';
            this.loadingElem.style.opacity = '1';
        }
    }

    /**
     * Oculta o overlay com animação suave de fade out.
     */
    hideLoading() {
        if (this.loadingElem) {
            this.loadingElem.style.opacity = '0';
            setTimeout(() => {
                this.loadingElem.style.display = 'none';
            }, 400);
        }
    }

    /**
     * Vincula eventos de seleção, drag & drop e input file.
     */
    bindEvents() {
        // Mudança no Dropdown de Presets
        if (this.modelSelectElem) {
            this.modelSelectElem.addEventListener('change', (e) => {
                const selectedVal = e.target.value;
                const selectedText = e.target.options[e.target.selectedIndex].text;
                if (selectedVal && selectedVal !== 'custom') {
                    this.loadModelPreset(selectedVal, selectedText);
                }
            });
        }

        // Input de Arquivo
        if (this.fileInputElem) {
            this.fileInputElem.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    this.loadCustomFile(e.target.files[0]);
                }
            });
        }

        // Drag & Drop na Janela
        if (this.dropZoneElem) {
            window.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.dropZoneElem.style.display = 'flex';
            });

            window.addEventListener('dragleave', (e) => {
                if (e.relatedTarget === null) {
                    this.dropZoneElem.style.display = 'none';
                }
            });

            window.addEventListener('drop', (e) => {
                e.preventDefault();
                this.dropZoneElem.style.display = 'none';
                if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                    this.loadCustomFile(e.dataTransfer.files[0]);
                }
            });
        }
    }

    /**
     * Carrega um modelo preset a partir de uma URL ou caminho relativo.
     * @param {string} url Caminho do arquivo .glb
     * @param {string} displayName Nome legível para o HUD
     */
    loadModelPreset(url, displayName) {
        this.showLoading();

        const cleanUrl = `${url}?_cb=${Date.now()}`;
        const getTerrainHeightFn = (x, z) => this.arena.getTerrainHeight(x, z);

        fetch(cleanUrl, { cache: 'no-store' })
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.arrayBuffer();
            })
            .then((arrayBuffer) => {
                this.gltfLoader.parse(arrayBuffer, '', (gltf) => {
                    const manifest = BotManifest.extractBotManifest(gltf, gltf.scene);
                    console.log(`[ModelLoader] Preset "${displayName}" carregado. Manifesto:`, manifest);
                    this.bot.setupModel(gltf.scene, url, manifest, getTerrainHeightFn);

                    if (displayName && this.modelDescElem) {
                        const manifestTag = manifest ? ' • 📋 Manifesto Ativo' : ' • 🔍 Auto-Escaneado';
                        this.modelDescElem.innerText = `${displayName}${manifestTag} • Escala 1:1`;
                    }
                    this.hideLoading();
                }, (parseErr) => {
                    console.error('[ModelLoader] Erro ao analisar buffer GLB:', parseErr);
                    this.hideLoading();
                });
            })
            .catch((err) => {
                console.warn(`[ModelLoader] Tentando caminho alternativo para ${url}...`, err);
                const altUrl = url.startsWith('../') ? url.replace('../', './') : `../${url}`;
                fetch(`${altUrl}?_cb=${Date.now()}`, { cache: 'no-store' })
                    .then((res) => res.arrayBuffer())
                    .then((arrayBuffer) => {
                        this.gltfLoader.parse(arrayBuffer, '', (gltf2) => {
                            const manifest = BotManifest.extractBotManifest(gltf2, gltf2.scene);
                            this.bot.setupModel(gltf2.scene, altUrl, manifest, getTerrainHeightFn);
                            if (displayName && this.modelDescElem) {
                                const manifestTag = manifest ? ' • 📋 Manifesto Ativo' : ' • 🔍 Auto-Escaneado';
                                this.modelDescElem.innerText = `${displayName}${manifestTag} • Escala 1:1`;
                            }
                            this.hideLoading();
                        });
                    })
                    .catch((err2) => {
                        alert(`Erro ao carregar modelo: ${err2.message}`);
                        this.hideLoading();
                    });
            });
    }

    /**
     * Carrega um arquivo local personalizado (.glb, .gltf ou .bot.json).
     * @param {File} file Arquivo do computador do usuário
     */
    loadCustomFile(file) {
        if (!file) return;

        const getTerrainHeightFn = (x, z) => this.arena.getTerrainHeight(x, z);

        // 1. Arquivo de Manifesto JSON (.bot.json / .json)
        if (file.name.toLowerCase().endsWith('.json') || file.name.toLowerCase().endsWith('.bot.json')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const manifest = JSON.parse(e.target.result);
                    if (this.bot.modelRoot) {
                        this.bot.setupModel(this.bot.modelRoot, file.name, manifest, getTerrainHeightFn);
                        if (this.modelDescElem) {
                            this.modelDescElem.innerText = `Manifesto Aplicado: ${file.name} • Escala 1:1`;
                        }
                    } else {
                        alert('Carregue primeiro um modelo .GLB antes de aplicar o manifesto .bot.json.');
                    }
                } catch (err) {
                    alert(`Erro ao ler manifesto JSON: ${err.message}`);
                }
            };
            reader.readAsText(file);
            return;
        }

        // 2. Arquivo de Modelo 3D (.GLB / .GLTF)
        this.showLoading();
        const reader = new FileReader();
        reader.onload = (e) => {
            const arrayBuffer = e.target.result;
            this.gltfLoader.parse(arrayBuffer, '', (gltf) => {
                const manifest = BotManifest.extractBotManifest(gltf, gltf.scene);
                this.bot.setupModel(gltf.scene, file.name, manifest, getTerrainHeightFn);

                if (this.modelDescElem) {
                    const manifestTag = manifest ? ' • 📋 Manifesto Ativo' : ' • 🔍 Auto-Escaneado';
                    this.modelDescElem.innerText = `Custom: ${file.name}${manifestTag} • Escala 1:1`;
                }

                if (this.optCustomElem) {
                    this.optCustomElem.disabled = false;
                    this.optCustomElem.innerText = `📂 ${file.name}`;
                    if (this.modelSelectElem) this.modelSelectElem.value = 'custom';
                }
                this.hideLoading();
            }, (err) => {
                alert(`Erro ao carregar modelo GLB: ${err.message}`);
                this.hideLoading();
            });
        };
        reader.readAsArrayBuffer(file);
    }
}
