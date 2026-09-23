/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — LEG.JS
 * Estrutura de Dados e Estado de Cada Pata do Robô Hexápode
 * ============================================================================
 * Modela a cadeia cinemática de 3 elos:
 * - J1: Coxa (baseNode -> j1Node)
 * - J2: Fêmur (j1Node -> j2Node)
 * - J3: Tíbia (j2Node -> j3Node -> ponta de contato)
 * 
 * Mantém referências aos nós 3D, comprimentos métricos calibrados (L1, L2, L3),
 * alvos no solo (currentTarget, stepStartTarget, stepEndTarget) e grupo tripé.
 */

import * as THREE from 'three';

/**
 * Posições de repouso canônicas proporcionais para um robô com alcance total de 7.32m.
 */
export const CANONICAL_BASE_FOOTPRINTS = {
    'FR': new THREE.Vector3(-5.8, 0.0,  3.2),
    'MR': new THREE.Vector3(-6.4, 0.0, -0.4),
    'BR': new THREE.Vector3(-5.2, 0.0, -4.0),
    'FL': new THREE.Vector3( 5.8, 0.0,  3.2),
    'ML': new THREE.Vector3( 6.4, 0.0, -0.4),
    'BL': new THREE.Vector3( 5.2, 0.0, -4.0)
};

export class Leg {
    /**
     * @param {Object} params
     * @param {string} params.id Identificador da perna (ex: 'FL', 'FR', 'ML', 'MR', 'BL', 'BR')
     * @param {string} params.side Lado ('D' para Direita / 'E' para Esquerda)
     * @param {number} params.group Grupo de marcha tripé (0: Grupo A [FR, ML, BR] | 1: Grupo B [FL, MR, BL])
     * @param {THREE.Object3D} params.baseNode Nó de quadril / Socket (P0)
     * @param {THREE.Object3D} params.j1Node Nó da Coxa (P1)
     * @param {THREE.Object3D} params.j2Node Nó do Fêmur / Joelho (P2)
     * @param {THREE.Object3D} params.j3Node Nó da Tíbia / Tornozelo (P3)
     * @param {number} params.L1 Comprimento métrico da Coxa
     * @param {number} params.L2 Comprimento métrico do Fêmur
     * @param {number} params.L3 Comprimento métrico da Tíbia
     * @param {THREE.Vector3} params.baseOffset Offset nominal relativo ao centro do corpo
     * @param {THREE.Object3D} [params.targetMesh=null] Esfera visual indicadora do pé
     * @param {THREE.Object3D} [params.lineMesh=null] Linha de esqueleto para o modo Raio-X
     */
    constructor({
        id,
        side,
        group,
        baseNode,
        j1Node,
        j2Node,
        j3Node,
        L1,
        L2,
        L3,
        baseOffset,
        targetMesh = null,
        lineMesh = null
    }) {
        this.id = id;
        this.side = side;
        this.group = group;

        // Nós hierárquicos do modelo 3D
        this.baseNode = baseNode;
        this.j1Node = j1Node;
        this.j2Node = j2Node;
        this.j3Node = j3Node;

        // Dimensões físicas dos segmentos
        this.L1 = L1;
        this.L2 = L2;
        this.L3 = L3;

        // Offsets canônicos e nominais
        this.baseOffset = baseOffset.clone();
        this.nominalOffset = baseOffset.clone();

        // Elementos visuais (Gizmos e Raio-X)
        this.targetMesh = targetMesh;
        this.lineMesh = lineMesh;

        // Coordenadas mundiais de apoio e interpolação de passos
        this.currentTarget = new THREE.Vector3();
        this.stepStartTarget = new THREE.Vector3();
        this.stepEndTarget = new THREE.Vector3();

        // Flag de perna em movimento no ar (Swing)
        this.isStepping = false;
    }

    /**
     * Retorna o alcance total somado dos 3 elos da perna.
     * @returns {number}
     */
    getTotalReach() {
        return this.L1 + this.L2 + this.L3;
    }

    /**
     * Atualiza o offset nominal da pata aplicando a abertura do corpo.
     * @param {number} stanceSpread Multiplicador de abertura (ex: 1.10x)
     */
    updateNominalOffset(stanceSpread) {
        this.nominalOffset.copy(this.baseOffset).multiplyScalar(stanceSpread);
    }
}
