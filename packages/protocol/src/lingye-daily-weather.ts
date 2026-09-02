import { z } from "zod";

export const lingyeDailyWeatherForecastSchema = z.object({
  title: z.string().refine((value) => value.trim().length > 0),
  body: z.string().refine((value) => value.trim().length > 0),
}).strict();

export const lingyeDailyWeatherResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({ weather_forecast: lingyeDailyWeatherForecastSchema.nullable() }).strict(),
}).strict();

export type LingyeDailyWeatherForecast = z.infer<typeof lingyeDailyWeatherForecastSchema>;
