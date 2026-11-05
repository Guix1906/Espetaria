import { describe, expect, it } from 'vitest';
import { isWithinStoreHours, storeClosedText } from '../storeHours';

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

describe('cardápio fecha sozinho fora do horário (turno esquecido aberto)', () => {
  it('dia normal: só das 18h às 22h59', () => {
    expect(isWithinStoreHours(new Date(2026, 10, 3, 17, 59))).toBe(false);
    expect(isWithinStoreHours(at(3, 18))).toBe(true);
    expect(isWithinStoreHours(new Date(2026, 10, 3, 22, 59))).toBe(true);
    expect(isWithinStoreHours(at(3, 23))).toBe(false);
    expect(isWithinStoreHours(at(3, 2))).toBe(false);
  });
  it('quarta fica fechado o dia todo', () => {
    expect(isWithinStoreHours(at(4, 19))).toBe(false);
    expect(isWithinStoreHours(at(4, 21))).toBe(false);
  });
});
