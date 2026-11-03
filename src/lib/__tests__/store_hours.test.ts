import { describe, expect, it } from 'vitest';
import { storeClosedText } from '../storeHours';

// 03/11/2026 é terça-feira
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0);

describe('aviso de loja fechada no cardápio', () => {
  it('antes das 18h em dia normal abre hoje', () => {
    expect(storeClosedText(at(2, 10))).toBe('abre hoje às 18h');
  });
  it('dentro do horário, com o turno ainda fechado, não manda para amanhã', () => {
    expect(storeClosedText(at(2, 19))).toBe('atendimento hoje até 23h');
  });
  it('depois das 23h abre amanhã', () => {
    expect(storeClosedText(at(2, 23))).toBe('abre amanhã às 18h');
  });
  it('quarta fechado: terça à noite aponta para quinta', () => {
    expect(storeClosedText(at(3, 23))).toBe('abre quinta às 18h');
  });
  it('na própria quarta, em qualquer hora, abre amanhã', () => {
    expect(storeClosedText(at(4, 10))).toBe('abre amanhã às 18h');
    expect(storeClosedText(at(4, 20))).toBe('abre amanhã às 18h');
  });
});
