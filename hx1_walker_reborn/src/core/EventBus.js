/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — EVENT BUS
 * Barramento de Eventos Desacoplado para Comunicação Intermodular (Pub/Sub)
 * ============================================================================
 * Permite que subsistemas distintos (UI, InputManager, HexaBot, LaserCombat)
 * troquem mensagens e eventos sem criar dependências circulares rígidas.
 */

export class EventBus {
    constructor() {
        /**
         * Dicionário de ouvintes indexado pelo nome do evento.
         * @type {Map<string, Set<Function>>}
         * @private
         */
        this.listeners = new Map();
    }

    /**
     * Registra um ouvinte para determinado evento.
     * @param {string} event Nome do evento
     * @param {Function} callback Função executada quando o evento for emitido
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    /**
     * Remove um ouvinte registrado.
     * @param {string} event Nome do evento
     * @param {Function} callback Função que deve ser desregistrada
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    /**
     * Emite um evento, disparando todos os ouvintes associados com os argumentos fornecidos.
     * @param {string} event Nome do evento
     * @param {...any} args Dados passados para os callbacks
     */
    emit(event, ...args) {
        if (this.listeners.has(event)) {
            for (const callback of this.listeners.get(event)) {
                try {
                    callback(...args);
                } catch (err) {
                    console.error(`[EventBus] Erro ao disparar evento "${event}":`, err);
                }
            }
        }
    }

    /**
     * Remove todos os ouvintes registrados em todos os eventos.
     */
    clear() {
        this.listeners.clear();
    }
}

// Instância singleton padrão para o projeto
export const globalEventBus = new EventBus();
