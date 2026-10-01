# 🔬 Laboratório de Cinemática Inversa (IK) & Ferramentas HexaBOT

[![GitHub Pages](https://img.shields.io/badge/Demo_Online-GitHub_Pages-38bdf8?style=for-the-badge&logo=github)](https://sandrobenigno.github.io/HexaBOT/)
[![Three.js](https://img.shields.io/badge/Three.js-r160-black?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](https://opensource.org/licenses/MIT)

Esta pasta reúne o conjunto de ferramentas interativas, ambientes de calibração, diagnóstico e a oficina de auto-rigging desenvolvidos durante o estudo aprofundado de cinemática inversa vetorial (IK 3-DoF), deformações de malha (*Shape Keys*) e persistência de manifestos biomecânicos.

---

## 🛠️ Confronto e Catálogo de Ferramentas

| Ferramenta | Link Online (GitHub Pages) | Foco Principal | Modelo Base / Fonte | Recursos Exclusivos |
| :--- | :--- | :--- | :--- | :--- |
| **Tool 1: Simulador Clássico & Mobile** | [Acessar Tool 1](https://sandrobenigno.github.io/HexaBOT/tools/index.html) | Simulação ágil, visualização de marcha e suporte mobile | `aranha.glb` | Curva Hermítica (*Smoothstep*), Auto-Sway contínuo, interface touch, telemetria simplificada |
| **Tool 2: Oficina de Rigging & Exportador** | [Acessar Tool 2](https://sandrobenigno.github.io/HexaBOT/tools/index2.html) | Auto-detecção de anatomia, calibração manual e exportação | Drag-and-Drop / `aranha.glb` / `aranha_pernalonga.glb` | Varredura Regex de sockets, medição métrica 3D ($L_1, L_2, L_3$), Console de Shape Keys (Mesa de Som), exportação de `.glb` com manifesto embutido e `.bot.json` |
| **Tool 3: Runtime de Produção com Manifesto** | [Acessar Tool 3](https://sandrobenigno.github.io/HexaBOT/tools/index3.html) | Consumo direto de manifestos e renderização de alta fidelidade | `aranha.glb` / Drag-and-Drop | Leitura de `userData.botManifest`, abas Frost Glass (IK + Shape Keys), travamento milimétrico de âncoras, iluminação HDR (*RoomEnvironment*) com rotação em tempo real |

---

## 🌟 Detalhamento das Ferramentas

### 1. 🤖 [Tool 1: Simulador Clássico & Mobile](https://sandrobenigno.github.io/HexaBOT/tools/index.html)
* **Objetivo:** Ambiente de testes de locomoção focado em responsividade e performance, ideal para validação rápida de cinemática em celulares e desktops.
* **Modelo 3D Base:** `aranha.glb` (carregado de `../hx1_walker_reborn/assets/glb/aranha.glb`).
* **Principais Funcionalidades:**
  - Curva de elevação adaptativa para a coxa com interpolação hermítica suave.
  - Balanço orgânico procedural contínuo (*Auto-Sway*).
  - Gaveta de parâmetros responsiva para dispositivos móveis.
  - Painel de atalhos e ajuda rápida via tecla <kbd>H</kbd>.

---

### 2. 🔬 [Tool 2: Oficina de Auto-Rig & Exportador de Bots](https://sandrobenigno.github.io/HexaBOT/tools/index2.html)
* **Objetivo:** Laboratório universal para importar criaturas arbitrárias, detectar sua estrutura articular e calibrar os limites cinemáticos antes do uso no jogo.
* **Auto-Rigging & Detecção Hierárquica:**
  - Varredura por Regex de ossos e sockets de pernas (`D0/E0`, `Socket`, `Hip`, `LegSocket`, etc.).
  - Medição automática dos comprimentos dos membros no espaço 3D ($L_1, L_2, L_3$).
  - Geração paramétrica de âncoras de contato de acordo com a escala do modelo.
* **Console de Shape Keys (Mesa de Som):**
  - Faders deslizantes inspirados em mesas de áudio profissionais.
  - Agrupamento inteligente de BlendShapes/Shape Keys que compartilham o mesmo nome lógico em um único fader sincronizado multi-malhas.
* **Exportação Não-Intrusiva:**
  - 💾 **Baixar Modelo .glb (Com Manifesto Embutido):** Salva o arquivo `.glb` contendo toda a receita de calibração em `userData.botManifest` (100% compatível com Blender e outros visualizadores).
  - 📄 **Baixar Manifesto .bot.json:** Exporta apenas o arquivo JSON com as medidas e parâmetros de postura.

---

### 3. 🚀 [Tool 3: Runtime de Produção (Consumidor de Manifesto)](https://sandrobenigno.github.io/HexaBOT/tools/index3.html)
* **Objetivo:** Simulador avançado de alta fidelidade que consome diretamente os arquivos gerados pela Oficina (Tool 2).
* **Recursos Avançados:**
  - Suporta *Drag-and-Drop* imediato de arquivos `.glb` e `.bot.json`.
  - **Travamento Milimétrico das Âncoras:** Elimina qualquer folga ou desvio entre a ponta da tíbia ($P_3$) e a âncora no solo.
  - Painel lateral *Frost Glass* com sistema de abas para **Cinemática & IK** e **Shape Keys**.
  - Iluminação PBR HDR com reflexos rotacionáveis e controle de intensidade em tempo real (*RoomEnvironment*).

---

## ⚡ Fundamentos Matemáticos e Cinemáticos

O laboratório de ferramentas apoia-se em um modelo analítico rigoroso de **Cinemática Inversa Vetorial (IK 3-DoF)** com determinação geométrica fechada e complexidade O(1).

```
         (P0: Socket / Quadril)
                 O
                / \
            L1 /   \ (Coxa: Ângulo de Abertura γ)
              /     \
             O (P1: Fêmur / Joelho)
              \
            L2 \    (Solução Fechada por Lei dos Cossenos)
                \
                 O (P2: Tíbia)
                 |
               L3|
                 |
                 O (P3: Target T / Âncora no Solo)
```

---

### 1. Construção da Base Ortonormal Zero-Bank

Para erradicar rotações parasitas de rolamento (*roll*) e torções espúrias durante a orientação da pata, o sistema constrói uma base ortonormal direta $\mathbf{R}_{\text{base}} = [\mathbf{X} \mid \mathbf{Y} \mid \mathbf{Z}]$ a partir de produtos vetoriais no espaço tridimensional:

$$
\mathbf{X} = \frac{\vec{T} - \vec{P}_0}{\|\vec{T} - \vec{P}_0\|} \gets \text{Vetor unitário diretor (linha de visada da pata)}
$$

$$
\mathbf{Z} = \frac{\mathbf{X} \times \vec{U}}{\|\mathbf{X} \times \vec{U}\|} \gets \text{Eixo da dobradiça (Hinge Axis perpendicular ao plano)}
$$

$$
\mathbf{Y} = \mathbf{Z} \times \mathbf{X} \gets \text{Vetor superior ortogonalizado à base}
$$

Onde:
* $\vec{P}_0$: Coordenada tridimensional do socket / raiz articular da perna.
* $\vec{T}$: Coordenada do ponto alvo de ancoragem no solo.
* $\vec{U} = (0, 1, 0)^T$: Vetor unitário vertical no referencial do robô.

Matriz de transformação e orientação canônica:

$$
\mathbf{R}_{\text{base}} = \begin{bmatrix} X_x & Y_x & Z_x \\ X_y & Y_y & Z_y \\ X_z & Y_z & Z_z \end{bmatrix}
$$

---

### 2. Solução Analítica dos Ângulos por Lei dos Cossenos

Com a posição tridimensional da coxa $\vec{P}_1$ calculada, determina-se a distância euclidiana $D$ até o alvo:

$$
D = \|\vec{T} - \vec{P}_1\|
$$

Pela Lei dos Cossenos no triângulo articular $[P_1, P_2, P_3]$:

$$
D^2 = L_2^2 + L_3^2 - 2 L_2 L_3 \cos(\pi - \beta)
$$

Isolando o cosseno da articulação da tíbia $\beta$:

$$
\cos(\beta) = \frac{L_2^2 + L_3^2 - D^2}{2 L_2 L_3}
$$

Aplicando a função limitadora de segurança $\text{clamp}$:

$$
\beta = \arccos\Big(\text{clamp}\big(\cos(\beta), -1, 1\big)\Big)
$$

Para o ângulo de elevação do fêmur $\alpha$, decompõe-se o ângulo diretor $\theta_{\text{target}}$ e a abertura triangular $\phi$:

$$
\cos(\phi) = \frac{D^2 + L_2^2 - L_3^2}{2 D L_2}
$$

$$
\phi = \arccos\Big(\text{clamp}\big(\cos(\phi), -1, 1\big)\Big)
$$

$$
\alpha = \theta_{\text{target}} \pm \phi
$$

---

### 3. Auto-Reach Fallback (Relaxamento Adaptativo Analítico O(1))

Quando a âncora no solo excede o alcance físico nominal da perna:

$$
\|\vec{T} - \vec{P}_1\| > L_2 + L_3
$$

O algoritmo calcula de forma determinística a constante geométrica de relaxamento $K$ e o ângulo de abertura da coxa $\gamma_{\text{fallback}}$:

$$
K = \frac{D_{\text{total}}^2 + L_1^2 - (L_2 + L_3)^2}{2 L_1 D_{\text{total}}} \gets \text{Constante geométrica analítica de transição}
$$

$$
\gamma_{\text{fallback}} = \theta_{\text{target}} + \arccos\Big(\text{clamp}\big(K, -1, 1\big)\Big)
$$

$$
\gamma_{\text{efetivo}} = \min\big(\gamma_{\text{nominal}}, \gamma_{\text{fallback}}\big)
$$

Onde:
* **$D_{\text{total}} = \|\vec{T} - \vec{P}_0\|$**: Distância total euclidiana do quadril ao contato no solo.
* **$L_1, L_2, L_3$**: Segmentos métricos detectados automaticamente na Tool 2.
* **$\gamma_{\text{nominal}}$**: Ângulo padrão de descanso da coxa definido no manifesto.
* **$\gamma_{\text{efetivo}}$**: Ângulo relaxado aplicado em tempo real, preservando a estabilidade postural e o contato milimétrico no solo.

---

### 4. Interpolação Hermítica da Marcha (Curva Smoothstep)

Durante a transição de passada (*Swing Phase*), a trajetória da pata entre a âncora anterior $\vec{A}_{\text{ant}}$ e o próximo ponto preditivo $\vec{A}_{\text{prox}}$ utiliza a função cúbica de Hermite para suavização de aceleração:

$$
s(t) = 3t^2 - 2t^3 \quad \text{onde} \quad t \in [0, 1]
$$

A interpolação no plano horizontal e o perfil de elevação parabólica são dados por:

$$
\vec{P}_{xy}(t) = \big(1 - s(t)\big)\vec{A}_{\text{ant}} + s(t)\vec{A}_{\text{prox}}
$$

$$
h(t) = 4 h_{\text{max}} \cdot t(1 - t) \gets \text{Elevação vertical suave com derivadas nulas nos extremos}
$$

---

## ⌨️ Tabela Geral de Atalhos

| Tecla | Função |
| :---: | :--- |
| <kbd>H</kbd> | Abrir / Fechar **Janela Central de Ajuda & Atalhos** |
| <kbd>P</kbd> | Alternar **Modo Clean View** (Oculta painéis para observação) |
| <kbd>R</kbd> | **Resetar Postura** para os valores padrão |
| <kbd>A</kbd> | Ativar / Desativar **Auto-Balanço (Auto-Sway)** |
| <kbd>X</kbd> | Alternar **Modo Raio-X** (Visualização articular e esquelética) |
| <kbd>I</kbd> | Alternar **Painel de Telemetria / Métricas HUD** |
| <kbd>Esc</kbd> | Fechar modal ativo |
