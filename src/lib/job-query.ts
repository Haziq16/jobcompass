import type { Prisma } from "@prisma/client";
import { AppError } from "./contracts";
export function jobFilters(params: URLSearchParams): Prisma.JobWhereInput {
  const and: Prisma.JobWhereInput[] = [];
  for (const field of [
    "employmentType",
    "seniority",
    "workArrangement",
    "industry",
    "employer",
  ] as const) {
    const value = params.get(field);
    if (value) {
      if (field === "employer") {
        and.push(
          value === "__unknown" ? { id: { in: [] } } : { employer: value },
        );
        continue;
      }
      const clause: Prisma.JobWhereInput = {
        [field]: value === "__unknown" ? null : value,
      };
      and.push(
        params.get(`unknown_${field}`) === "true" && value !== "__unknown"
          ? { OR: [clause, { [field]: null }] }
          : clause,
      );
    }
  }
  const age = Number(params.get("age"));
  if (age > 0 && age <= 365) {
    const clause = {
      publishedAt: { gte: new Date(Date.now() - age * 86400000) },
    };
    and.push(
      params.get("unknown_age") === "true"
        ? { OR: [clause, { publishedAt: null }] }
        : clause,
    );
  }
  const salary = Number(params.get("salary"));
  if (salary > 0) {
    const currency = params.get("currency"),
      period = params.get("period");
    if (!currency || !period) throw new AppError("salary_units_required");
    const clause: Prisma.JobWhereInput = {
      salaryCurrency: currency,
      salaryPeriod: period,
      OR: [{ salaryMin: { gte: salary } }, { salaryMax: { gte: salary } }],
    };
    and.push(
      params.get("unknown_salary") === "true"
        ? { OR: [clause, { salaryMin: null, salaryMax: null }] }
        : clause,
    );
  } else if (params.get("salary") === "unknown")
    and.push({ salaryMin: null, salaryMax: null });
  return and.length ? { AND: and } : {};
}
