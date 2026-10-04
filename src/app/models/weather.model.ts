export interface WeatherLocation {
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface WeatherSnapshot {
  location: WeatherLocation;
  temperature: number;
  code: number;
  isDay: boolean;
  minimum: number;
  maximum: number;
  rainProbability?: number;
  date: string;
  updatedAt: number;
}

export function weatherCondition(code: number, isDay = true): { icon: string; label: string; symbol?: string } {
  if (code === 0) return { icon: isDay ? 'pi-sun' : 'pi-moon', label: 'Despejado' };
  if (code === 1) return { icon: isDay ? 'pi-cloud' : 'pi-moon', label: 'Mayormente despejado', symbol: isDay ? '🌤️' : undefined };
  if (code === 2) return { icon: 'pi-cloud', label: 'Parcialmente nublado', symbol: isDay ? '🌤️' : undefined };
  if (code === 3) return { icon: 'pi-cloud', label: 'Nublado' };
  if (code === 45 || code === 48) return { icon: 'pi-align-justify', label: 'Niebla', symbol: '🌫️' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: 'pi-sparkles', label: 'Nieve', symbol: '❄️' };
  if ([95, 96, 97, 99].includes(code)) return { icon: 'pi-bolt', label: 'Tormenta', symbol: '⛈️' };
  if ([51, 53, 55, 56, 57].includes(code)) return { icon: 'pi-cloud', label: 'Llovizna', symbol: '🌧️' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: 'pi-cloud', label: 'Lluvia', symbol: '🌧️' };
  return { icon: 'pi-cloud', label: 'Tiempo variable' };
}