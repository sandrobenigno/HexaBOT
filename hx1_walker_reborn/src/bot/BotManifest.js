/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — BOTMANIFEST.JS
 * Parser e Normalizador de Metadados / Manifesto (.glb / .bot.json / presets)
 * ============================================================================
 * Responsável por extrair com profundidade e fidelidade os metadados gerados pelo
 * workshop de calibração (index2.html), gravados tanto no JSON interno do GLTF
 * quanto em arquivos .bot.json ou userData de nós.
 * 
 * Contrato de Dados:
 * - anatomy: pernas, sockets, comprimentos L1/L2/L3 e defaultFootTarget
 * - calibration: defaultHeight, stanceSpread, strideLength, stepHeight
 * - swayDefaults: speed, heightAmp, pitchRoll, yaw, shift
 */

export class BotManifest {
    /**
     * Tenta converter uma entrada (objeto ou string JSON) em um objeto de manifesto válido.
     * @param {any} val
     * @returns {Object|null}
     */
    static parse(val) {
        if (!val) return null;
        if (typeof val === 'string') {
            try {
                return JSON.parse(val);
            } catch (e) {
                console.warn('[BotManifest] Falha ao fazer parse de string JSON de manifesto:', e);
                return null;
            }
        }
        if (typeof val === 'object') return val;
        return null;
    }

    /**
     * Extrai profundamente o manifesto do robô a partir do objeto GLTF, da Scene ou dos nós internos.
     * @param {Object} gltf Objeto resultante do GLTFLoader
     * @param {THREE.Object3D} gltfScene Cena Three.js carregada
     * @returns {Object|null} Manifesto extraído ou null
     */
    static extractBotManifest(gltf, gltfScene) {
        // 1. Inspecionar propriedades diretas do objeto GLTF e Scene
        if (gltf && gltf.userData && gltf.userData.botManifest) {
            const m = BotManifest.parse(gltf.userData.botManifest);
            if (m) return m;
        }
        if (gltfScene && gltfScene.userData && gltfScene.userData.botManifest) {
            const m = BotManifest.parse(gltfScene.userData.botManifest);
            if (m) return m;
        }
        if (gltf && gltf.scene && gltf.scene.userData && gltf.scene.userData.botManifest) {
            const m = BotManifest.parse(gltf.scene.userData.botManifest);
            if (m) return m;
        }

        // 2. Traverse completo em toda a árvore hierárquica do Three.js Scene
        const sceneToSearch = gltfScene || (gltf ? gltf.scene : null);
        let foundManifest = null;
        if (sceneToSearch && sceneToSearch.traverse) {
            sceneToSearch.traverse((child) => {
                if (!foundManifest && child.userData && child.userData.botManifest) {
                    foundManifest = BotManifest.parse(child.userData.botManifest);
                }
            });
        }
        if (foundManifest) return foundManifest;

        // 3. Inspecionar JSON raw do glTF parser (extras nos nós, nas cenas ou no asset)
        if (gltf && gltf.parser && gltf.parser.json) {
            const json = gltf.parser.json;
            if (json.userData && json.userData.botManifest) {
                const m = BotManifest.parse(json.userData.botManifest);
                if (m) return m;
            }
            if (json.extras && json.extras.botManifest) {
                const m = BotManifest.parse(json.extras.botManifest);
                if (m) return m;
            }
            if (json.asset && json.asset.extras && json.asset.extras.botManifest) {
                const m = BotManifest.parse(json.asset.extras.botManifest);
                if (m) return m;
            }
            if (json.scenes) {
                for (const s of json.scenes) {
                    if (s && s.extras && s.extras.botManifest) {
                        const m = BotManifest.parse(s.extras.botManifest);
                        if (m) return m;
                    }
                }
            }
            if (json.nodes) {
                for (const n of json.nodes) {
                    if (n && n.extras && n.extras.botManifest) {
                        const m = BotManifest.parse(n.extras.botManifest);
                        if (m) return m;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Retorna os valores padrão de calibração para modelos conhecidos ou genéricos.
     * @param {string} modelName Nome ou caminho do modelo
     * @returns {Object} Configuração padrão
     */
    static getFallbackCalibration(modelName = '') {
        const isHX1 = modelName.includes('aranha.glb') && !modelName.includes('pernalonga');
        if (isHX1) {
            return {
                defaultHeight: 0.75,
                stanceSpread: 1.00,
                swayDefaults: { speed: 4.0, heightCenter: 0.75, heightAmp: 0.05, pitchRoll: 2.0, yaw: 4.0, shift: 0.1 }
            };
        }
        // Padrão HX2 (Pernalonga)
        return {
            defaultHeight: 1.85,
            stanceSpread: 1.00,
            swayDefaults: { speed: 3.7, heightCenter: 1.85, heightAmp: 0.05, pitchRoll: 1.0, yaw: 3.0, shift: 0.3 }
        };
    }
}
