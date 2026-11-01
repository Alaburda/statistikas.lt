# Generates src/engine/reference.json: the values the TypeScript engine is tested
# against. Run from the repo root after changing anything in the grids below:
#   Rscript --vanilla _imtis-src/scripts/reference.R
suppressPackageStartupMessages({
  library(PowerTOST)
  library(pwr)
  library(jsonlite)
})

out <- list(meta = list(
  r = R.version.string,
  PowerTOST = as.character(packageVersion("PowerTOST")),
  pwr = as.character(packageVersion("pwr"))
))

# ---- Distributions ----
grid <- expand.grid(t = c(-3, -0.5, 0.7, 1.96, 4), df = c(1, 2, 5, 22, 120, 3000), ncp = c(-1, 0.5, 2.8, 6))
grid$p <- mapply(function(t, df, ncp) pt(t, df, ncp), grid$t, grid$df, grid$ncp)
out$pnt <- grid

grid <- expand.grid(f = c(0.5, 2.5, 6), df1 = c(1, 3, 7), df2 = c(6, 40, 400), ncp = c(0, 2.5, 18, 120))
grid$p <- mapply(function(f, a, b, n) pf(f, a, b, ncp = n), grid$f, grid$df1, grid$df2, grid$ncp)
out$pnf <- grid

grid <- expand.grid(p = c(0.8, 0.95, 0.975, 0.999), df = c(1, 3, 10, 34, 500))
grid$qt <- mapply(qt, grid$p, grid$df)
grid$qchisq <- mapply(qchisq, grid$p, grid$df)
out$quantiles <- grid

grid <- expand.grid(nu = c(2, 7, 22, 118), t = c(1.7, -1.7), delta = c(-3.2, 0.8, 4.5), b = c(1.5, 4, 12))
grid$q <- mapply(function(nu, t, delta, b) OwensQ(nu, t, delta, 0, b), grid$nu, grid$t, grid$delta, grid$b)
out$owensq <- grid

# ---- Two independent means (pwr.t.test) ----
grid <- expand.grid(
  d = c(0.2, 0.35, 0.5, 0.8, 1.2), power = c(0.8, 0.9, 0.95), alpha = c(0.01, 0.05),
  alt = c("two.sided", "greater"), stringsAsFactors = FALSE
)
res <- t(mapply(function(d, power, alpha, alt) {
  n <- ceiling(pwr.t.test(d = d, power = power, sig.level = alpha, type = "two.sample", alternative = alt)$n)
  c(n = n, achieved = pwr.t.test(n = n, d = d, sig.level = alpha, type = "two.sample", alternative = alt)$power)
}, grid$d, grid$power, grid$alpha, grid$alt))
out$means <- cbind(grid, res)

grid <- expand.grid(n1 = c(12, 40, 150), k = c(1.5, 2, 3), d = c(0.3, 0.6), alpha = c(0.01, 0.05))
grid$n2 <- ceiling(grid$n1 * grid$k)
grid$power <- mapply(function(n1, n2, d, a) pwr.t2n.test(n1 = n1, n2 = n2, d = d, sig.level = a)$power, grid$n1, grid$n2, grid$d, grid$alpha)
out$meansUnequal <- grid

# ---- Paired ----
grid <- expand.grid(
  d = c(0.25, 0.5, 0.8), power = c(0.8, 0.9), alpha = c(0.01, 0.05),
  alt = c("two.sided", "greater"), stringsAsFactors = FALSE
)
res <- t(mapply(function(d, power, alpha, alt) {
  n <- ceiling(pwr.t.test(d = d, power = power, sig.level = alpha, type = "paired", alternative = alt)$n)
  c(n = n, achieved = pwr.t.test(n = n, d = d, sig.level = alpha, type = "paired", alternative = alt)$power)
}, grid$d, grid$power, grid$alpha, grid$alt))
out$paired <- cbind(grid, res)

# ---- Two proportions (power.prop.test) ----
grid <- expand.grid(p1 = c(0.04, 0.2, 0.5, 0.6), lift = c(0.05, 0.1, 0.2), power = c(0.8, 0.9), alpha = c(0.01, 0.05))
grid$p2 <- grid$p1 + grid$lift
res <- t(mapply(function(p1, p2, power, alpha) {
  n <- ceiling(power.prop.test(p1 = p1, p2 = p2, power = power, sig.level = alpha)$n)
  c(n = n, achieved = power.prop.test(n = n, p1 = p1, p2 = p2, sig.level = alpha)$power)
}, grid$p1, grid$p2, grid$power, grid$alpha))
out$props <- cbind(grid, res)

# Unequal allocation has no base R function: the Fleiss formula, then the real test
# simulated at that n, so the formula itself is checked rather than just copied.
set.seed(20261101)
fleiss <- function(p1, p2, k, alpha, power) {
  pbar <- (p1 + k * p2) / (1 + k)
  a <- qnorm(1 - alpha / 2) * sqrt((1 + 1 / k) * pbar * (1 - pbar))
  b <- qnorm(power) * sqrt(p1 * (1 - p1) + p2 * (1 - p2) / k)
  ceiling((a + b)^2 / (p1 - p2)^2)
}
grid <- expand.grid(p1 = c(0.1, 0.3), p2 = c(0.2, 0.45), k = c(2, 3), alpha = 0.05, power = 0.8)
grid$n1 <- mapply(fleiss, grid$p1, grid$p2, grid$k, grid$alpha, grid$power)
grid$n2 <- ceiling(grid$n1 * grid$k)
grid$simPower <- mapply(function(p1, p2, n1, n2) {
  x1 <- rbinom(2e5, n1, p1)
  x2 <- rbinom(2e5, n2, p2)
  pooled <- (x1 + x2) / (n1 + n2)
  z <- (x2 / n2 - x1 / n1) / sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2))
  mean(abs(z) > qnorm(0.975), na.rm = TRUE)
}, grid$p1, grid$p2, grid$n1, grid$n2)
out$propsUnequal <- grid

# ---- One-way ANOVA ----
grid <- expand.grid(k = c(3, 4, 6), f = c(0.1, 0.25, 0.4), power = c(0.8, 0.9), alpha = c(0.01, 0.05))
res <- t(mapply(function(k, f, power, alpha) {
  n <- ceiling(pwr.anova.test(k = k, f = f, power = power, sig.level = alpha)$n)
  c(n = n, achieved = pwr.anova.test(k = k, n = n, f = f, sig.level = alpha)$power)
}, grid$k, grid$f, grid$power, grid$alpha))
out$anova <- cbind(grid, res)

# ---- Correlation ----
grid <- expand.grid(
  r = c(0.1, 0.3, 0.5, 0.7), power = c(0.8, 0.9), alpha = c(0.01, 0.05),
  alt = c("two.sided", "greater"), stringsAsFactors = FALSE
)
res <- t(mapply(function(r, power, alpha, alt) {
  n <- ceiling(pwr.r.test(r = r, power = power, sig.level = alpha, alternative = alt)$n)
  c(n = n, achieved = pwr.r.test(n = n, r = r, sig.level = alpha, alternative = alt)$power)
}, grid$r, grid$power, grid$alpha, grid$alt))
out$corr <- cbind(grid, res)

# ---- Average bioequivalence (TOST, exact) ----
designs <- c("parallel", "2x2", "3x3", "3x6x3", "4x4", "2x2x3", "2x2x4", "2x4x4", "2x3x3", "2x4x2", "2x2x2r", "paired")
grid <- expand.grid(
  design = designs, cv = c(0.08, 0.15, 0.25, 0.4, 0.6), theta0 = c(0.88, 0.95, 1, 1.08),
  power = c(0.8, 0.9), alpha = 0.05, stringsAsFactors = FALSE
)
res <- t(mapply(function(design, cv, theta0, power, alpha) {
  r <- sampleN.TOST(CV = cv, theta0 = theta0, targetpower = power, alpha = alpha, design = design, print = FALSE)
  c(n = r[["Sample size"]], achieved = r[["Achieved power"]])
}, grid$design, grid$cv, grid$theta0, grid$power, grid$alpha))
out$tost <- cbind(grid, res)

# Narrow therapeutic index limits, a non-default alpha, and a very large study.
grid <- rbind(
  data.frame(design = "2x2", cv = c(0.1, 0.2, 0.3), theta0 = 0.975, theta1 = 0.9, theta2 = 1 / 0.9, power = 0.9, alpha = 0.05),
  data.frame(design = "2x2", cv = c(0.2, 0.35), theta0 = 0.95, theta1 = 0.8, theta2 = 1.25, power = 0.8, alpha = 0.025),
  data.frame(design = "parallel", cv = 1.2, theta0 = 0.97, theta1 = 0.8, theta2 = 1.25, power = 0.9, alpha = 0.05)
)
res <- t(mapply(function(design, cv, theta0, theta1, theta2, power, alpha) {
  r <- sampleN.TOST(
    CV = cv, theta0 = theta0, theta1 = theta1, theta2 = theta2, targetpower = power,
    alpha = alpha, design = design, print = FALSE
  )
  c(n = r[["Sample size"]], achieved = r[["Achieved power"]])
}, grid$design, grid$cv, grid$theta0, grid$theta1, grid$theta2, grid$power, grid$alpha))
out$tostLimits <- cbind(grid, res)

# Power after dropouts, including unbalanced sequences.
unbalanced <- list(
  list(design = "2x2", cv = 0.25, theta0 = 0.95, n = c(14, 12)),
  list(design = "2x2", cv = 0.3, theta0 = 0.9, n = c(30, 21)),
  list(design = "2x3x3", cv = 0.35, theta0 = 0.95, n = c(14, 13, 12))
)
out$tostUnbalanced <- lapply(unbalanced, function(x) {
  x$power <- power.TOST(CV = x$cv, theta0 = x$theta0, n = x$n, design = x$design)
  x
})
out$tostOdd <- lapply(c(25, 31, 37), function(n) {
  list(n = n, power = suppressMessages(power.TOST(CV = 0.3, theta0 = 0.95, n = n, design = "2x2")))
})

grid <- expand.grid(cv = c(0.12, 0.25, 0.4), df = c(10, 22, 40), alpha = c(0.2, 0.05))
grid$upper <- mapply(function(cv, df, alpha) CVCL(cv, df, side = "upper", alpha = alpha)[["upper CL"]], grid$cv, grid$df, grid$alpha)
out$cvcl <- grid

pa <- pa.ABE(CV = 0.25, theta0 = 0.95, targetpower = 0.8, minpower = 0.7, design = "2x2")
out$pa <- list(cvMax = max(pa$paCV$CV), gmrMin = min(pa$paGMR$theta0), nMin = min(pa$paN$N), n = pa$plan[["Sample size"]])

# ---- EMA reference-scaled limits (ABEL, simulated) ----
grid <- expand.grid(
  design = c("2x3x3", "2x2x4", "2x2x3"), cv = c(0.3, 0.4, 0.5, 0.65), theta0 = c(0.9, 0.95),
  power = 0.8, stringsAsFactors = FALSE
)
res <- t(mapply(function(design, cv, theta0, power) {
  r <- sampleN.scABEL(CV = cv, theta0 = theta0, targetpower = power, design = design, nsims = 1e6, print = FALSE, details = FALSE)
  c(n = r[["Sample size"]], achieved = r[["Achieved power"]])
}, grid$design, grid$cv, grid$theta0, grid$power))
out$abel <- cbind(grid, res)

grid <- expand.grid(design = c("2x3x3", "2x2x4", "2x2x3"), cv = c(0.25, 0.35, 0.55), theta0 = c(0.9, 1.25), n = c(36, 60), stringsAsFactors = FALSE)
grid$power <- mapply(function(design, cv, theta0, n) {
  suppressMessages(power.scABEL(CV = cv, theta0 = theta0, n = n, design = design, nsims = 1e6))
}, grid$design, grid$cv, grid$theta0, grid$n)
out$abelPower <- grid
out$abelLimits <- lapply(c(0.25, 0.3, 0.4, 0.5, 0.7), function(cv) {
  l <- scABEL(cv)
  list(cv = cv, lower = l[["lower"]], upper = l[["upper"]])
})

write_json(out, "_imtis-src/src/engine/reference.json", dataframe = "rows", digits = 12, auto_unbox = TRUE)
cat("reference.json written:", sum(sapply(out[-1], function(x) if (is.data.frame(x)) nrow(x) else length(x))), "rows\n")
