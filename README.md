# 🤖 HexaBOT — Tactical Mech Engine & IK Research

[![GitHub Pages](https://img.shields.io/badge/Demo%20Online-GitHub%20Pages-38bdf8?style=for-the-badge&logo=github)](https://sandrobenigno.github.io/HexaBOT/)
[![Three.js](https://img.shields.io/badge/Three.js-r160-black?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

O **HexaBOT** nasceu como um estudo matemático e exercício aprofundado sobre **Cinemática Inversa Vetorial (IK 3-DoF)**, auto-rigging procedural e dinâmica de marcha para robôs hexápodes em computação gráfica 3D. 

O projeto evoluiu progressivamente através de ferramentas de calibração, bancadas de teste e um laboratório de deformações (*Shape Keys*), culminando no **HX1 Walker: Reborn** — um simulador tático de combate robótico em tempo real totalmente jogável no navegador.

---

## 🎮 O Jogo: HX1 Walker: Reborn

> 🕹️ **JOGAR ONLINE**: [https://sandrobenigno.github.io/HexaBOT/hx1_walker_reborn/index.html](https://sandrobenigno.github.io/HexaBOT/hx1_walker_reborn/index.html)

```
       [ Retículo / Mira ]
              ◎
               \   (Feixe Contínuo de Plasma Térmico)
                \=========================> [ Inimigo / Cabine ]
         ┌───────────────┐
       ╱ │   HEXABOT     │ ╲
     ─┼──┤  TACTICAL MECH ├──┼─   [ Marcha Tripé com IK 3-DOF Analítico ]
       ╲ │               │ ╱
         └───────┬───────┘
                ╱ ╲
```

### Principais Destaques do Gameplay
* **Marcha Tripé com IK Analítico 3-DoF:** Motores de passo matemáticos com algoritmo analítico de *Auto-Reach Fallback* em tempo constante $O(1)$, garantindo contato firme das 6 patas mesmo sob aclives acentuados e desníveis do terreno.
* **Sistema de Combate & Retículo Tático:** Mira em 360° com campo de visão dinâmico (FOV 60°), oclusão analítica de visada por relevo/obstáculos, recuo físico do chassi (*Shooting Shift*) e disparo contínuo de feixe de plasma térmico.
* **Inteligência Artificial & Inimigos:** Cabines geradoras com escudos de energia segmentados que realizam o *spawn* de joaninhas robóticas dotadas de animações em tempo real via *Shape Keys / Morph Targets*, fala espacial e detonação de bombas com física de repulsão.
* **Paisagem & Shader PBR:** Arena com dunas e escombros procedurais, blend dinâmico de mapas de normais (ladrilhos vs. areia) e iluminação cênica com sombras projetadas (*PCFShadowMap*).
* **Áudio Espacial Imersivo:** Sonorização 3D posicional com *Web Audio API*, modulação orgânica da intensidade/pitch dos servomotores em tempo real e trilha sonora dinâmica.

### ⌨️ Controles do Jogo (HX1 Walker: Reborn)

| Comando | Ação |
| :---: | :--- |
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Locomoção no terreno (Avançar, Recuar e Strafe Lateral) |
| <kbd>Mouse</kbd> | Mirar e Disparar Laser de Plasma Térmico |
| <kbd>Espaço</kbd> | Travar / Destravar Mira (Lock-On Holográfico) |
| <kbd>Botão do Meio (Drag)</kbd> | Órbita e rotação livre da câmera tática |
| <kbd>Scroll do Mouse</kbd> | Ajuste de Zoom da câmera (50m a 100m) |
| <kbd>P</kbd> | Exibir / Ocultar Painéis Táticos e Sliders de Calibração |
| <kbd>H</kbd> | Abrir / Fechar Guia de Ajuda in-game |
| <kbd>X</kbd> | Alternar Modo Raio-X Biomecânico |
| <kbd>R</kbd> | Resetar Posição na Arena |

---

## 🔬 Laboratório & Ferramentas de Cinemática

Toda a infraestrutura do jogo foi construída sobre um conjunto de ferramentas e protótipos de pesquisa:

1. **📱 [Tool 1: Simulador Clássico & Mobile](https://sandrobenigno.github.io/HexaBOT/tools/index.html)** — Ambiente leve de simulação com balanço contínuo (*Auto-Sway*), suporte a controles touch e curva hermítica de elevação de pernas.
2. **🎛️ [Tool 2: Oficina de Rigging & Exportador](https://sandrobenigno.github.io/HexaBOT/tools/index2.html)** — Laboratório universal para importação de modelos arbitrários via Drag-and-Drop, detecção hierárquica por Regex, console de *Shape Keys* estilo mesa de som e exportação de manifestos biomecânicos (`.bot.json` e `.glb` com manifesto embutido).
3. **🚀 [Tool 3: Runtime com Manifesto](https://sandrobenigno.github.io/HexaBOT/tools/index3.html)** — Simulador de alta fidelidade que consome diretamente os manifestos biomecânicos com travamento milimétrico de âncoras e iluminação HDR (*RoomEnvironment*).

> 📖 **Para mais detalhes das ferramentas, consulte a [Documentação das Tools](https://github.com/sandrobenigno/HexaBOT/blob/main/tools/README.md).**

---

## ⚡ Fundamentos Matemáticos da Cinemática

O robô utiliza um solucionador trigonométrico rigoroso para cada uma das 6 pernas:

* **Base Ortonormal Zero-Bank:** Elimina rotações indesejadas em torno do eixo longitudinal da pata através da projeção direta no plano da dobradiça.
* **Solução Fechada por Lei dos Cossenos:** Calcula os ângulos $\alpha$ (fêmur) e $\beta$ (tíbia) analiticamente sem iterações numéricas pesadas.
* **Auto-Reach Fallback:** Quando a distância até a âncora excede o limite físico da pata, o algoritmo ajusta suavemente o ângulo de abertura $\gamma$, mantendo o robô estável e impedindo que as patas se descolem do solo:
  $$K = \frac{D_{\text{total}}^2 + L_1^2 - (L_2 + L_3)^2}{2 L_1 D_{\text{total}}}$$
  $$\gamma_{\text{fallback}} = \theta_{\text{target}} + \arccos(\text{clamp}(K, -1, 1))$$

---

## 📁 Estrutura do Projeto

```text
├── index.html                   # Launcher / Hub principal de navegação (GitHub Pages)
├── README.md                    # Documentação geral do projeto
├── hx1_walker_reborn/           # 🎮 O Jogo (Simulador Tático de Combate)
│   ├── index.html               # Ponto de entrada do jogo
│   ├── css/                     # Estilos sci-fi do HUD e barras gamer
│   ├── assets/
│   │   ├── glb/                 # Modelos 3D locais (aranha.glb, aranha_pernalonga.glb, LadyBUG.glb)
│   │   ├── img/                 # Normal maps de piso e areia/rocha
│   │   └── mp3/                 # Efeitos sonoros espaciais e trilhas
│   └── src/                     # Arquitetura modular ES6 (Engine, Bot, Kinematics, Combat, Audio, UI)
└── tools/                       # 🔬 Laboratório de IK e Ferramentas de Pesquisa
    ├── index.html               # Tool 1: Simulador Clássico & Mobile
    ├── index2.html              # Tool 2: Oficina de Rigging & Exportador
    ├── index3.html              # Tool 3: Runtime de Produção com Manifesto
    └── README.md                # Documentação técnica detalhada das ferramentas
```

---

## 🛠️ Tecnologias Principais

* **[Three.js (r160)](https://threejs.org/)** — Renderização 3D WebGL, iluminação física PBR e shaders customizados.
* **Web Audio API** — Processamento de áudio espacial 3D com posicionamento e pitch dinâmico.
* **JavaScript ES6 Modular** — Arquitetura desacoplada via `EventBus`.
* **HTML5 Canvas & CSS3 Moderno** — Interface de usuário (HUD) tática responsiva com efeitos translúcidos e barras de status gamer.
