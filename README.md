# 🤖 HexaBOT — Tactical Mech Engine & IK Research

[![GitHub Pages](https://img.shields.io/badge/Demo%20Online-GitHub%20Pages-38bdf8?style=for-the-badge&logo=github)](https://sandrobenigno.github.io/HexaBOT/)
[![Three.js](https://img.shields.io/badge/Three.js-r160-black?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

O **HexaBOT** é um projeto de pesquisa e simulação em computação gráfica 3D focado em **Cinemática Inversa Vetorial (IK 3-DoF)**, auto-rigging procedural e locomoção para robôs hexápodes. 

A plataforma inclui uma suíte completa de ferramentas de calibração, diagnóstico e deformação de malha (*Shape Keys*), além do **HX1 Walker: Reborn** — um jogo tático de combate robótico em tempo real executado diretamente no navegador.

---

## 🎮 O Jogo: HX1 Walker: Reborn

> 🕹️ **JOGAR ONLINE**: [https://sandrobenigno.github.io/HexaBOT/hx1_walker_reborn/index.html](https://sandrobenigno.github.io/HexaBOT/hx1_walker_reborn/index.html)  
> 📖 **DOCUMENTAÇÃO DEDICADA**: [Consulte o README do Jogo](file:///x:/GEMINY/AranhaThreeJS/hx1_walker_reborn/README.md)

![screen](img/ScreenGame.jpg)

### Principais Destaques do Gameplay
* **Marcha Tripé com IK Analítico 3-DoF:** Solucionador trigonométrico fechado com algoritmo *Auto-Reach Fallback* em tempo constante $O(1)$, garantindo contato firme das 6 patas sem escorregamento (*Zero Slipping*) sob qualquer aclive ou desnível.
* **Sistema de Combate & Laser de Plasma:** Disparo livre com restrição de FOV ($\pm 30^\circ$), recuo mecânico do chassi (*Shooting Shift*), colisão física por raycasting e *Welding Sparks Fountain* (faíscas incandescentes em arco parabólico com rastro inercial e glow multi-camadas).
* **Esferas de Plasma (Supercharge & Healing):**
  - **⚡ Supercharge (Azul):** Surge nos 28 monólitos perimétricos (sinalizador de 160m). Concede **500% de energia** e feixe ampliado.
  - **❤️ Regeneração / Healing (Vermelha):** Surge nos 16 tambores/cilindros de colisão da arena. Restaura **+500 HP** de vida com áudio estéreo dedicado (`healing.mp3`).
  - Coleta analítica ultrarrápida ($0\text{ms}$) ao mirar na orbe e pressionar <kbd>Espaço</kbd>.
* **Inteligência Artificial & Inimigos:** Cabines geradoras modulares com 4 portas de saída e robôs joaninhas (*LadyBUG*) com animação procedural via *Shape Keys* (`DROP`), minas de proximidade de 3s e comportamento de bando com separação física (*Anti-Nesting*).
* **Cenário Sci-Fi & Sky Dome:** Arena de $300\text{m} \times 300\text{m}$ cercada por 28 monólitos fortaleza e abóbada hemisférica de $148\text{m}$ com shader procedural GLSL (campo de força hexagonal *honeycomb*, radar ascendente e estrelas), com trava de câmera esférica anti-atravessamento.
* **Áudio Espacial & Modulação Dinâmica:** Áudio posicional 3D via *Web Audio API*, modulação contínua do pitch dos servomotores pelo movimento do tronco, envelope ADSR no canhão laser e trilhas comemorativas para a vitória (dança funk com confetes) e derrota (ritual tribal com fogueira).

### ⌨️ Controles do Jogo (HX1 Walker: Reborn)

| Comando | Ação |
| :---: | :--- |
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Locomoção no terreno (Avanço, Recuo e Strafe Lateral) |
| <kbd>Mouse</kbd> | Mirar e Disparar Laser de Plasma Térmico |
| <kbd>Espaço</kbd> | Coletar Orbes (Supercharge / Cura) / Travar Mira / Continuar |
| <kbd>Botão do Meio (Drag)</kbd> | Órbita e rotação livre da câmera tática |
| <kbd>Scroll do Mouse</kbd> | Ajuste de Zoom da câmera (50m a 100m) |
| <kbd>P</kbd> | Pausar / Despausar a Simulação e Combate |
| <kbd>H</kbd> | Abrir / Fechar Guia Central de Ajuda in-game (Pausa automática) |
| <kbd>X</kbd> | Alternar Modo Raio-X Biomecânico |
| <kbd>R</kbd> | Resetar Partida / Posição do Mech |
| <kbd>Esc</kbd> | Fechar Janelas Modais / Pausar Jogo |
| *(Oculto)* <kbd>O</kbd> | Exibir / Ocultar Painéis de Calibração e Sliders |

---

## 🔬 Laboratório & Ferramentas de Cinemática

A plataforma conta com uma suíte de ferramentas de engenharia e inspeção:

1. **📱 [Tool 1: Simulador Clássico & Mobile](https://sandrobenigno.github.io/HexaBOT/tools/index.html)** — Ambiente leve de simulação com balanço contínuo (*Auto-Sway*), suporte a controles touch e curva hermítica de elevação de patas.
2. **🎛️ [Tool 2: Oficina de Rigging & Exportador](https://sandrobenigno.github.io/HexaBOT/tools/index2.html)** — Laboratório universal para importação de modelos via Drag-and-Drop, detecção hierárquica por Regex, console de *Shape Keys* estilo mesa de som e exportação de manifestos biomecânicos (`.bot.json` e `.glb` com manifesto embutido).
3. **🚀 [Tool 3: Runtime com Manifesto](https://sandrobenigno.github.io/HexaBOT/tools/index3.html)** — Simulador de alta fidelidade que consome diretamente os manifestos biomecânicos com travamento milimétrico de âncoras e iluminação HDR (*RoomEnvironment*).

> 📖 **Para documentação técnica detalhada das ferramentas, consulte o [README das Tools](file:///x:/GEMINY/AranhaThreeJS/tools/README.md).**

---

## ⚡ Fundamentos Matemáticos da Cinemática

Cada uma das 6 pernas é calculada de forma independente através de uma cadeia cinemática de 3 graus de liberdade:

* **Base Ortonormal Zero-Bank:** Alinha o plano da perna ao eixo da dobradiça (*hinge axis*) usando produtos vetoriais puros, eliminando rotações parasitas de rolamento (*roll*).
* **Solução Fechada por Lei dos Cossenos:** Determina os ângulos $\alpha$ (fêmur) e $\beta$ (tíbia) analiticamente sem iterações numéricas:
* **Auto-Reach Fallback ($O(1)$):** Quando a âncora excede o alcance nominal da perna, o ângulo de abertura $\gamma$ é relaxado analiticamente em tempo constante:
  $$K = \frac{D_{\text{total}}^2 + L_1^2 - (L_2 + L_3)^2}{2 L_1 D_{\text{total}}}$$
  $$\gamma_{\text{fallback}} = \theta_{\text{target}} + \arccos(\text{clamp}(K, -1, 1))$$

---

## 📁 Estrutura do Projeto

```text
├── index.html                   # Launcher / Hub de navegação (GitHub Pages)
├── README.md                    # Documentação geral do projeto
├── hx1_walker_reborn/           # 🎮 O Jogo (Simulador Tático de Combate)
│   ├── index.html               # Ponto de entrada do jogo
│   ├── README.md                # Documentação detalhada da mecânica e arquitetura do jogo
│   ├── css/                     # Folha de estilos sci-fi (HUD, barras de status, modais)
│   ├── assets/
│   │   ├── glb/                 # Modelos 3D locais (aranha.glb, aranha_pernalonga.glb, LadyBUG.glb)
│   │   ├── img/                 # Normal maps de relevo (areia, piso, blocos, rocha)
│   │   └── mp3/                 # Efeitos sonoros espaciais e trilhas (laser, supercharge, kaboom, etc.)
│   └── src/                     # Arquitetura modular ES6 desacoplada via EventBus
│       ├── core/                # Engine 3D, EventBus e InputManager
│       ├── audio/               # SoundManager com Web Audio API espacial
│       ├── world/               # TerrainArena (PBR, blocos, Sky Dome) e CollisionSystem
│       ├── kinematics/          # IKSolver, Leg e TripodGait
│       ├── bot/                 # HexaBot, AutoSway e BotManifest
│       ├── combat/              # LaserCombat, SuperchargeManager, LadybugEnemy, CabinSpawner, EnemyManager
│       └── ui/                  # HUDController e ModelLoaderUI
└── tools/                       # 🔬 Laboratório de Cinemática e Ferramentas
    ├── index.html               # Tool 1: Simulador Clássico & Mobile
    ├── index2.html              # Tool 2: Oficina de Rigging & Exportador de Bots
    ├── index3.html              # Tool 3: Runtime com Consumo de Manifesto
    └── README.md                # Documentação técnica da suíte de ferramentas
```

---

## 🛠️ Tecnologias Principais

* **[Three.js (r160)](https://threejs.org/)** — Renderização WebGL, iluminação PBR, shaders customizados e PMREM Environment.
* **Web Audio API** — Espacialização 3D, modulação orgânica de pitch e controle de envelope ADSR.
* **JavaScript ES6 Modular** — Arquitetura de eventos desacoplada (*Publish/Subscribe*).
* **GLSL Shaders** — Shaders atmosféricos para o Sky Dome e texturização procedural com blend de relevo.
* **HTML5 Canvas & CSS3** — Interface tática translúcida de baixa latência.
