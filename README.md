# 🕷️ HexaBOT & Universal Creature IK Engine

Simulador 3D interativo de robótica biomecânica em **Three.js** com cinemática inversa vetorial (IK 3-DoF), **Auto-Reach Fallback** analítico em tempo constante $O(1)$, detector hierárquico e auto-rigging universal para modelos 3D arbitrários, renderização PBR com *RoomEnvironment* reativo e sistema de diagnóstico visual em tempo real.

---

## 🌟 Visão Geral & Módulos

O projeto é dividido em dois ambientes complementares:

### 1. 🤖 `index.html` — Simulador Calibrado HexaBOT
* Ambiente especializado e calibrado para o modelo hexápode **HexaBOT** (`aranha.glb` / `aranha_material_2.glb`).
* Curva de elevação adaptativa com interpolação hermítica (Smoothstep) para a coxa.
* Controle de postura estática (Posição X/Y/Z, Rotação Pitch/Yaw/Roll, Altura).
* Balanço orgânico procedural contínuo (*Auto-Sway / Rebolado*).
* Controle de BlendShapes faciais (`IRIS_E` e `IRIS_D`).
* Ajuste dinâmico de abertura das âncoras das patas no solo (*Spread Factor*).

### 2. 🧬 `index2.html` — Universal Creature Auto-Rigging & IK Engine
* **Laboratório Universal de Criaturas**: Importe qualquer modelo 3D GLB/glTF via *Drag-and-Drop* ou seletor de arquivos.
* **Auto-Rigging & Detecção Hierárquica**:
  - Varredura inteligente de sockets de pernas via Regex (`D0/E0`, `Socket`, `Hip`, `LegSocket`, etc.).
  - Medição métrica automática dos comprimentos nativos das juntas no espaço 3D ($L_1, L_2, L_3$).
  - Geração procedural e paramétrica das âncoras de contato proporcionais à anatomia do modelo.
  - Reconstrução dinâmica da espinha dorsal central esquelética.

---

## ⚡ Principais Recursos & Inovações Técnicas

### 📐 1. Cinemática Inversa Vetorial 3-DoF (Zero-Bank)
* **Base Ortonormal Rigorosa**: Construção explícita de matrizes ortonormais $\mathbf{R} = [\mathbf{X} \mid \mathbf{Y} \mid \mathbf{Z}]$ alinhando o eixo da dobradiça (*hinge axis*) ao vetor local sem distorções de rolamento espúrio (*zero bank/roll distortion*).
* **Solução Fechada por Lei dos Cossenos**: Resolução trigonométrica analítica de alta performance para os ângulos $\alpha$ (fêmur) e $\beta$ (tíbia).

### 🛡️ 2. Auto-Reach Fallback (Relaxamento Adaptativo Analítico)
* Quando o robô se eleva ou as patas se afastam além do alcance nominal da coxa ($\|T - P_1\| > L_2 + L_3$), o algoritmo deduz analiticamente em **tempo constante $O(1)$** o ângulo exato de relaxamento $\gamma_{\text{fallback}}$:
  $$K = \frac{D_{\text{total}}^2 + L_1^2 - (L_2 + L_3)^2}{2 L_1 D_{\text{total}}}$$
  $$\gamma_{\text{fallback}} = \theta_{\text{target}} + \arccos(\text{clamp}(K, -1, 1))$$
  $$\gamma_{\text{efetivo}} = \min(\gamma_{\text{nominal}}, \gamma_{\text{fallback}})$$
* **Garantia Biomecânica**: A ponta da tíbia nunca se descola do solo e a cinemática não quebra em posturas extremas.

### 🩺 3. Telemetria & Diagnóstico Visual de Tensão
* **Linhas de Esqueleto Espessas**: Renderizadas com `Line2` e `LineSegments2` (largura de 5.0px com anti-aliasing e suporte Shader nativo).
* **Feedback de Tensão Dinâmico**:
  - 🟢 **Verde Esmeralda (`#7bed9f` / `#2ed573`)**: Lado Esquerdo em postura nominal.
  - 🔵 **Ciano Elétrico (`#38bdf8` / `#00d2ff`)**: Lado Direito em postura nominal.
  - 🟡 **Amarelo Ouro (`#ffd32a`)**: Perna sob alta tensão geométrica ($\tau > 0.85$).
  - 🔴 **Vermelho Alerta Vivo (`#ff0038`)**: Atuação do **Auto-Reach Fallback** (coxa relaxou para manter a âncora colada no solo).
* **Painel HUD de Telemetria**: Monitoramento em tempo real de altura, rotações, comprimentos $L_1, L_2, L_3$, distância de alcance e estado de contato de cada perna.

### 🦴 4. Modo X-Ray Biomecânico Nítido
* Alternado com a tecla **`X`**.
* Oculta as malhas sólidas do modelo e exibe exclusivamente o sistema articular interno: esferas e eixos em cruz dos 4 pivôs de cada membro ($P_0, P_1, P_2, P_3$), linhas ósseas espessas e a espinha central.

### 💡 5. Iluminação PBR & RoomEnvironment Reativo
* Integração com **`RoomEnvironment`** via gerador PMREM para iluminação baseada em física (PBR) com reflexos metálicos/dielétricos realistas.
* **Presets de Ambiente**:
  - `Studio / Dark Room`
  - `Exterior Dia (Sky Blue)`
  - `Cyberpunk (Neon Dark)`
  - `Por do Sol (Sunset Gold)`
* Controles em tempo real de intensidade de reflexo e rotação do ambiente (`envRotation`).
* Marcadores 3D posicionais (*Gizmos*) para controle direto da luz solar direcional e luzes de preenchimento (*Rim Lights*).

---

## ⌨️ Teclas de Atalho

| Tecla | Função |
| :---: | :--- |
| **`X`** | Alternar **Modo X-Ray** (Visão esquelética / biomecânica) |
| **`I`** | Alternar **Painel de Telemetria / Métricas HUD** |
| **`R`** | **Resetar Postura** para os valores nominais padrão |

---

## 📂 Estrutura de Arquivos

```text
├── glb/
│   ├── aranha.glb               # Modelo 3D base da Aranha HexaBOT
│   ├── aranha_material.glb      # Variação de materiais e texturas
│   └── aranha_material_2.glb    # Modelo em alta resolução com blendshapes
├── index.html                   # Aplicação principal (HexaBOT calibrado)
├── index2.html                  # Motor universal de Auto-Rig e IK para qualquer GLTF/GLB
└── README.md                    # Documentação do projeto
```

---

## 🚀 Como Executar

Por utilizar carregamento dinâmico de modelos GLB e módulos ES6 via CDN, execute o projeto através de qualquer servidor HTTP local:

### Com Python 3:
```bash
python -m http.server 8080
```
Acesse em seu navegador:
* `http://localhost:8080/index.html` (HexaBOT)
* `http://localhost:8080/index2.html` (Universal Auto-Rigging Lab)

### Com Node.js (`npx serve` ou `live-server`):
```bash
npx serve .
```

---

## 🛠️ Tecnologias Utilizadas

* **[Three.js (r160)](https://threejs.org/)**: Motor gráfico 3D WebGL / PBR.
* **`three/addons/lines/Line2.js` & `LineMaterial.js`**: Renderização de linhas esqueléticas espessas com anti-aliasing.
* **`three/addons/environments/RoomEnvironment.js`**: Geração de mapa de ambiente HDR procedural.
* **[lil-gui (v0.19.1)](https://lil-gui.georgealways.com/)**: Painel de controle paramétrico em tempo real.
* **GLTFLoader** & **OrbitControls**: Carregamento e navegação 3D orbital suave.
