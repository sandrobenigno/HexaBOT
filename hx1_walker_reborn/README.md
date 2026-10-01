# 🎮 HX1 Walker: Reborn — Manual Tático & Arquitetura do Jogo

[![Jogar Online](https://img.shields.io/badge/Jogar_Online-GitHub_Pages-38bdf8?style=for-the-badge&logo=github)](https://sandrobenigno.github.io/HexaBOT/hx1_walker_reborn/index.html)
[![Three.js](https://img.shields.io/badge/Three.js-r160-black?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![Web Audio API](https://img.shields.io/badge/Web_Audio_API-3D_Spatial-blue?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](https://opensource.org/licenses/MIT)

O **HX1 Walker: Reborn** é um simulador tático de combate robótico em tempo real para navegador, construído sobre um motor de **Cinemática Inversa Vetorial (IK 3-DoF)** e renderização PBR em Three.js.

---

## 🕹️ Como Jogar

> 🚀 **Acesse instantaneamente no navegador:** [https://sandrobenigno.github.io/HexaBOT/hx1_walker_reborn/index.html](https://sandrobenigno.github.io/HexaBOT/hx1_walker_reborn/index.html)

### ⌨️ Tabela de Controles

| Comando | Ação | Descrição |
| :---: | :--- | :--- |
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | **Locomoção** | Marcha tripé com avanço, recuo e strafe lateral contínuos |
| <kbd>Mouse (Esquerdo)</kbd> | **Disparo do Laser** | Dispara feixe de plasma térmico contínuo na direção da mira |
| <kbd>Espaço</kbd> | **Ação Multifunção** | **Coletar Supercharge** (com mira na esfera) / **Lock-On** / **Continuar Missão** |
| <kbd>Botão do Meio (Drag)</kbd> | **Câmera Orbital** | Rotação livre de 360° ao redor do mech |
| <kbd>Scroll do Mouse</kbd> | **Zoom da Câmera** | Ajuste dinâmico de distância (50m a 100m) |
| <kbd>P</kbd> | **Pausa da Simulação** | Pausa e despausa o combate e a física a qualquer momento |
| <kbd>H</kbd> | **Guia de Ajuda** | Abre o modal central de comandos in-game (pausa automaticamente o jogo) |
| <kbd>R</kbd> | **Reset de Missão** | Restaura a posição inicial, reinicia geradores e orbe de plasma |
| <kbd>Esc</kbd> | **Fechar / Pausa** | Fecha janelas modais ativas ou alterna a pausa |
| *(Oculto)* <kbd>O</kbd> | **Painel de Calibração** | Atalho oculto de desenvolvimento para sliders de postura, relevo e Raio-X |

---

## ⚡ Mecânicas Principais

### 1. Sistema de Marcha & Cinemática Inversa (IK 3-DoF)
* **Zero Slipping:** As pernas em apoio (*Stance*) permanecem estritamente ancoradas nas coordenadas mundiais enquanto o corpo translada e gira.
* **Auto-Reach Fallback (Tempo Constante O(1)):** Solução analítica para relaxamento de perna caso o alvo de apoio exceda o alcance nominal (L2 + L3):

$$
K = \frac{D_{\text{total}}^2 + L_1^2 - (L_2 + L_3)^2}{2 L_1 D_{\text{total}}} \implies \gamma_{\text{fallback}} = \theta_{\text{target}} + \arccos\Big(\text{clamp}\big(K, -1, 1\big)\Big)
$$

* **Mira Dual-Tier:** Para desvios angulares |Δθ| ≤ 25°, apenas o tronco torce com IK; para |Δθ| > 25°, o mech executa passos de pivô dinâmicos preservando o alinhamento de tiro.

---

### 2. Canhão de Plasma Térmico & Efeitos de Faísca
* **FOV Dinâmico de 60° (±30°):** Disparo liberado no cone de visada frontal:

$$
\cos(\theta) = \frac{\vec{D}_{\text{aim}} \cdot \vec{F}_{\text{body}}}{\|\vec{D}_{\text{aim}}\| \|\vec{F}_{\text{body}}\|} \ge \cos(30^\circ) \approx 0.866
$$

* **Raycast de Colisão Real:** O feixe colide com o primeiro objeto sólido no trajeto (inimigos, cabines, blocos, pilares ou relevo).
* **Welding Sparks Fountain (Brasas de Solda em Arco):** Partículas volumétricas incandescentes projetadas em trajetórias parabólicas balísticas com amortecimento de quique no solo:

$$
\vec{r}(t) = \vec{r}_0 + \vec{v}_0 t - \frac{1}{2} g t^2 \hat{j} \quad \text{onde} \quad g = 19.5\,\text{m/s}^2
$$

  Inclui rastro inercial de movimento da mira e glow multi-camadas (clarão central, aura estendida e luz pontual ciano de 28m).

---

### 3. Esferas de Plasma: Supercharge (Azul) & Regeneração (Vermelha)
* **⚡ Supercharge (500% de Laser):** Surge no topo dos 28 monólitos fortaleza perimétricos com um feixe vertical sinalizador (*Sky Beacon*). Mirar na esfera e pressionar <kbd>Espaço</kbd> concede 500% de potência e feixe volumétrico hiper-ampliado.
* **❤️ Regeneração / Cura (+500 HP):** Surge no topo dos 16 tambores de colisão da arena com feixe vertical vermelho. Mirar na esfera e pressionar <kbd>Espaço</kbd> restaura instantaneamente +500 HP de integridade estrutural com feedback sonoro espacial dedicado.
* **Ciclos de Respawn Contínuos:** Ambos os orbes rotacionam de posição se não coletados em 14s e ressurgem dinamicamente (3 a 6s) após a coleta.

---

### 4. Inimigos, Cabines & Rituais
* **Cabines Geradoras (Spawners):** Estruturas blindadas modulares com 4 portas que geram joaninhas robóticas periodicamente.
* **Joaninhas Mecânicas (LadyBUG):** Perseguem o mech em bando, realizam animação procedural de abertura de carapaça, depositam minas de proximidade de 3s e possuem algoritmo de dispersão física suave (*Anti-Nesting*).
* **Derrota (Cena Tribal):** Se o mech for destruído, os robôs inimigos formam um círculo de dança ao redor dos destroços com fogueira física e cântico tribal.
* **Vitória (Comemoração & Confetes):** Ao aniquilar todas as cabines e inimigos, o mech executa coreografia comemorativa com trilha dedicada e chuva de confetes neon.

---

### 5. Cenário & Sky Dome
* **Arena Tática PBR:** Terreno de 300m × 300m com dunas, degraus sólidos escaláveis e blend contínuo entre o piso ladrilhado e o relevo rochoso.
* **Sky Dome (R = 148m):** Abóbada hemisférica com shader atmosférico contendo campo de força hexagonal (*honeycomb*), anéis de latitude, varredura de radar ascendente e estrelas.
* **Contenção Esférica de Câmera:** Impede atravessamento da abóbada mantendo distância segura e foco ininterrupto no robô.

---

## 🏛️ Arquitetura do Código (`src/`)

```
hx1_walker_reborn/src/
├── core/
│   ├── Engine.js           # Gerenciador Three.js (Cena, Câmera Orbital, Luzes, Fog e Game Loop)
│   ├── EventBus.js         # Barramento de eventos Pub/Sub desacoplado
│   └── InputManager.js     # Captura de inputs, raymarching analítico de relevo e mira
├── audio/
│   └── SoundManager.js     # Áudio 3D posicional, envelope ADSR do laser e modulação de pitch
├── world/
│   ├── TerrainArena.js     # Terreno PBR, monólitos, caixas pisáveis e Sky Dome
│   └── CollisionSystem.js  # Restrições de polígono de sustentação e limites da arena
├── kinematics/
│   ├── Leg.js              # Estrutura articular de cada perna e nós 3D
│   ├── IKSolver.js         # Solver 3-DoF com base ortonormal Zero-Bank e Auto-Reach Fallback
│   └── TripodGait.js       # Máquina de estados da marcha tripé sem escorregamento
├── bot/
│   ├── BotManifest.js      # Parser e extrator profundo de manifestos biomecânicos
│   ├── AutoSway.js         # Balanço orgânico procedural em repouso (500ms idle)
│   └── HexaBot.js          # Controlador mestre do robô, física de impacto e telemetria
├── combat/
│   ├── LaserCombat.js      # Feixe volumétrico, FOV 60°, raycast de colisão e welding sparks
│   ├── SuperchargeManager.js # Esfera de plasma nos monólitos, 500% de laser e sky beacon
│   ├── LadybugEnemy.js     # IA do robô joaninha, animação de drop e ritual tribal
│   ├── CabinSpawner.js     # Cabines geradoras de 4 portas com barra de dano
│   ├── Bomb.js             # Mina com timer de 3s e detonação em área
│   ├── TribalFX.js         # Partículas de fogueira e fumaça para a cena tribal
│   ├── VictoryFX.js        # Canhão de confetes neon e iluminação festiva
│   ├── ShapeKeyAnimator.js # Expressões de morph targets (íris, olhos e carapaça)
│   └── EnemyManager.js     # Orquestrador de inimigos, spawning e círculo de dança
└── ui/
    ├── HUDController.js    # Bússola 360°, barras de vida/energia e atalhos
    └── ModelLoaderUI.js    # Seletor de presets, drag & drop e upload de modelos
```

---

## 🚀 Como Rodar Localmente

Basta iniciar qualquer servidor web estático na raiz do repositório:

```powershell
# Usando Python:
python -m http.server 8000

# Usando Node.js (npx):
npx serve .
```

Abra no navegador: `http://localhost:8000/hx1_walker_reborn/index.html`
