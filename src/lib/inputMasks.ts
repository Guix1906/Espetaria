import type { PixKeyType } from '../types/enums';

const digits = (value: string) => value.replace(/\D/g, '');

/** 00.000.000/0000-00 enquanto digita. */
export function maskCnpj(value: string): string {
  const d = digits(value).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

/** (00) 00000-0000 ou (00) 0000-0000 enquanto digita. */
export function maskPhone(value: string): string {
  const d = digits(value).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  const split = rest.length > 8 ? 5 : 4;
  return rest.length > split ? `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}` : `(${ddd}) ${rest}`;
}

/** Maiúsculas sem acento (padrão BACEN para nome e cidade do PIX). */
export function toPixText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

/** Confere se a chave combina com o tipo escolhido. Retorna a mensagem de erro ou null. */
export function pixKeyError(type: PixKeyType, key: string): string | null {
  const value = key.trim();
  if (!value) return 'Informe a chave PIX.';
  switch (type) {
    case 'EMAIL':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : 'E-mail inválido.';
    case 'CPF':
      return digits(value).length === 11 ? null : 'O CPF precisa ter 11 números.';
    case 'CNPJ':
      return digits(value).length === 14 ? null : 'O CNPJ precisa ter 14 números.';
    case 'TELEFONE':
      return [10, 11, 12, 13].includes(digits(value).length) ? null : 'Telefone inválido. Use DDD + número.';
    case 'ALEATORIA':
      return /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(value) ? null : 'Chave aleatória inválida (36 caracteres, com hífens).';
    default:
      return null;
  }
}
