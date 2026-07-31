import axios from "axios";
import { z } from "zod";
import { defineTool } from "archadi-agent";

export const weatherTool = defineTool({
  name: "get_weather",
  description: "Fetches realtime weather for a city using wttr.in.",
  schema: z.object({
    city: z.string().describe("City name, e.g. 'Delhi' or 'San Francisco'"),
  }),
  async execute({ city }) {
    const url = `https://wttr.in/${encodeURIComponent(city.toLowerCase())}?format=%C+%t+(feels+like+%f),+humidity+%h,+wind+%w`;
    const res = await axios.get(url, { responseType: "text", timeout: 10_000 });
    return { city, report: String(res.data).trim() };
  },
});
