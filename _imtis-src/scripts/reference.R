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

# ---- F and chi-square tests beyond pwr: G*Power's formulas, written out ----
fpower <- function(lambda, df1, df2, alpha) {
  if (df2 <= 0) return(0)
  1 - pf(qf(1 - alpha, df1, df2), df1, df2, ncp = lambda)
}
first_n <- function(pw, target, from = 2) {
  n <- from
  while (pw(n) < target) n <- n + 1
  n
}

grid <- expand.grid(x = c(0.5, 3.84, 9.49, 25), df = c(1, 4, 12), ncp = c(0, 1.5, 10, 60))
grid$p <- mapply(function(x, df, ncp) pchisq(x, df, ncp = ncp), grid$x, grid$df, grid$ncp)
out$pnchisq <- grid

grid <- expand.grid(w = c(0.1, 0.3, 0.5), df = c(1, 2, 6), power = c(0.8, 0.9), alpha = c(0.01, 0.05))
res <- t(mapply(function(w, df, power, alpha) {
  n <- ceiling(pwr.chisq.test(w = w, df = df, power = power, sig.level = alpha)$N)
  c(n = n, achieved = pwr.chisq.test(w = w, N = n, df = df, sig.level = alpha)$power)
}, grid$w, grid$df, grid$power, grid$alpha))
out$chisq <- cbind(grid, res)

# Linear regression, R² deviation from zero: pwr.f2.test with N = u + v + 1.
grid <- expand.grid(u = c(1, 3, 8), f2 = c(0.02, 0.15, 0.35), power = c(0.8, 0.9), alpha = c(0.01, 0.05))
res <- t(mapply(function(u, f2, power, alpha) {
  n <- ceiling(pwr.f2.test(u = u, f2 = f2, power = power, sig.level = alpha)$v) + u + 1
  c(n = n, achieved = pwr.f2.test(u = u, v = n - u - 1, f2 = f2, sig.level = alpha)$power)
}, grid$u, grid$f2, grid$power, grid$alpha))
out$reg <- cbind(grid, res)

# R² increase: lambda = f² N, df = (q, N - p - 1).
grid <- expand.grid(p = c(4, 10), q = c(1, 3), base = c(0.1, 0.3), gain = c(0.02, 0.08), power = c(0.8, 0.9), alpha = 0.05)
grid <- grid[grid$q <= grid$p, ]
res <- t(mapply(function(p, q, base, gain, power, alpha) {
  f2 <- gain / (1 - base - gain)
  pw <- function(n) fpower(f2 * n, q, n - p - 1, alpha)
  n <- first_n(pw, power, p + 2)
  c(n = n, achieved = pw(n))
}, grid$p, grid$q, grid$base, grid$gain, grid$power, grid$alpha))
out$regGain <- cbind(grid, res)

# Factorial ANOVA and ANCOVA: lambda = f² N, df2 = N - cells - covariates; n per cell.
grid <- expand.grid(a = c(2, 3), b = c(2, 4), effect = c("A", "B", "AB"), f = c(0.15, 0.25, 0.4), cov = c(0, 2), power = 0.8, alpha = 0.05, stringsAsFactors = FALSE)
res <- t(mapply(function(a, b, effect, f, cov, power, alpha) {
  df1 <- switch(effect, A = a - 1, B = b - 1, AB = (a - 1) * (b - 1))
  pw <- function(n) fpower(f^2 * a * b * n, df1, a * b * n - a * b - cov, alpha)
  n <- first_n(pw, power, 2)
  c(n = n, achieved = pw(n))
}, grid$a, grid$b, grid$effect, grid$f, grid$cov, grid$power, grid$alpha))
out$factorial <- cbind(grid, res)

# One-way ANCOVA through the same formula (cells = groups).
grid <- expand.grid(k = c(2, 3, 5), f = c(0.2, 0.35), cov = c(1, 3), power = c(0.8, 0.9), alpha = 0.05)
res <- t(mapply(function(k, f, cov, power, alpha) {
  pw <- function(n) fpower(f^2 * k * n, k - 1, k * n - k - cov, alpha)
  n <- first_n(pw, power, 2)
  c(n = n, achieved = pw(n))
}, grid$k, grid$f, grid$cov, grid$power, grid$alpha))
out$ancova <- cbind(grid, res)

# Repeated measures, as G*Power 3.1 (n per group, N = k n).
rm_terms <- function(k, m, effect, f, rho, eps, n) {
  N <- k * n
  if (effect == "between") return(c(k - 1, N - k, f^2 * N * m / (1 + (m - 1) * rho)))
  df1 <- if (effect == "within") (m - 1) * eps else (k - 1) * (m - 1) * eps
  c(df1, (N - k) * (m - 1) * eps, f^2 * N * m * eps / (1 - rho))
}
grid <- expand.grid(
  k = c(1, 2, 3), m = c(2, 3, 5), effect = c("within", "between", "inter"), f = c(0.1, 0.25, 0.4),
  rho = c(0.3, 0.7), eps = c(1, 0.6), power = 0.8, alpha = 0.05, stringsAsFactors = FALSE
)
grid <- grid[!(grid$k == 1 & grid$effect != "within") & !(grid$effect == "between" & grid$eps != 1) & !(grid$m == 2 & grid$eps != 1), ]
res <- t(mapply(function(k, m, effect, f, rho, eps, power, alpha) {
  pw <- function(n) { t <- rm_terms(k, m, effect, f, rho, eps, n); fpower(t[3], t[1], t[2], alpha) }
  n <- first_n(pw, power, 2)
  c(n = n, achieved = pw(n))
}, grid$k, grid$m, grid$effect, grid$f, grid$rho, grid$eps, grid$power, grid$alpha))
out$rm <- cbind(grid, res)

# The formulas against the real tests, simulated. Split-plot sums of squares by hand
# (balanced, compound symmetry, so epsilon = 1), at the n the formula gives.
set.seed(20261108)
sim_rm <- function(means, sd, rho, n, effect, sims = 20000, alpha = 0.05) {
  k <- nrow(means); m <- ncol(means)
  S <- sd^2 * (rho + (1 - rho) * diag(m))
  g <- rep(seq_len(k), each = n)
  mu <- means[g, , drop = FALSE]
  hits <- 0
  for (s in seq_len(sims)) {
    y <- mu + MASS::mvrnorm(k * n, rep(0, m), S)
    subj <- rowMeans(y)
    gm <- rowsum(y, g) / n                    # k x m cell means
    gbar <- rowMeans(gm)
    tbar <- colMeans(y)
    grand <- mean(y)
    ss_g <- m * n * sum((gbar - grand)^2)
    ss_s <- m * sum((subj - gbar[g])^2)
    ss_t <- k * n * sum((tbar - grand)^2)
    ss_gt <- n * sum((gm - outer(gbar, tbar, "+") + grand)^2)
    ss_e <- sum((y - subj - gm[g, , drop = FALSE] + gbar[g])^2)
    dfe <- (k * n - k) * (m - 1)
    F <- switch(effect,
      within = (ss_t / (m - 1)) / (ss_e / dfe),
      inter = (ss_gt / ((k - 1) * (m - 1))) / (ss_e / dfe),
      between = (ss_g / (k - 1)) / (ss_s / (k * n - k))
    )
    df1 <- switch(effect, within = m - 1, inter = (k - 1) * (m - 1), between = k - 1)
    df2 <- if (effect == "between") k * n - k else dfe
    hits <- hits + (F > qf(1 - alpha, df1, df2))
  }
  hits / sims
}
rm_cases <- list(
  list(means = rbind(c(10, 11, 12.5)), sd = 5, rho = 0.5, effect = "within"),
  list(means = rbind(c(10, 11, 12), c(12, 13, 14)), sd = 5, rho = 0.5, effect = "between"),
  list(means = rbind(c(10, 10, 10, 10), c(10, 11, 12, 13)), sd = 5, rho = 0.6, effect = "inter"),
  list(means = rbind(c(10, 12, 13), c(10, 12, 13), c(11, 13, 14)), sd = 4, rho = 0.3, effect = "within")
)
out$rmSim <- lapply(rm_cases, function(x) {
  k <- nrow(x$means); m <- ncol(x$means)
  grand <- mean(x$means)
  rmean <- rowMeans(x$means); cmean <- colMeans(x$means)
  f <- switch(x$effect,
    within = sqrt(mean((cmean - grand)^2)) / x$sd,
    between = sqrt(mean((rmean - grand)^2)) / x$sd,
    inter = sqrt(mean((x$means - outer(rmean, cmean, "+") + grand)^2)) / x$sd
  )
  pw <- function(n) { t <- rm_terms(k, m, x$effect, f, x$rho, 1, n); fpower(t[3], t[1], t[2], 0.05) }
  n <- first_n(pw, 0.8, 2)
  list(means = x$means, sd = x$sd, rho = x$rho, effect = x$effect, f = f, n = n, power = pw(n),
       simPower = sim_rm(x$means, x$sd, x$rho, n, x$effect))
})

# Two-way factorial, simulated with lm, and an ANCOVA with a correlated covariate.
sim_factorial <- function(means, sd, n, effect, sims = 4000) {
  a <- nrow(means); b <- ncol(means)
  A <- factor(rep(rep(seq_len(a), times = b), each = n)); B <- factor(rep(rep(seq_len(b), each = a), each = n))
  mu <- means[cbind(as.integer(A), as.integer(B))]
  options(contrasts = c("contr.sum", "contr.poly"))
  row <- switch(effect, A = "A", B = "B", AB = "A:B")
  mean(replicate(sims, {
    y <- mu + rnorm(length(mu), 0, sd)
    anova(lm(y ~ A * B))[row, "Pr(>F)"] < 0.05
  }))
}
fac_cases <- list(
  list(means = rbind(c(10, 12, 14), c(11, 13, 15)), sd = 4, effect = "B"),
  list(means = rbind(c(10, 10, 10), c(10, 12, 14)), sd = 4, effect = "AB"),
  list(means = rbind(c(10, 11), c(12, 13)), sd = 3, effect = "A")
)
out$factorialSim <- lapply(fac_cases, function(x) {
  a <- nrow(x$means); b <- ncol(x$means)
  grand <- mean(x$means); rmean <- rowMeans(x$means); cmean <- colMeans(x$means)
  f <- switch(x$effect,
    A = sqrt(mean((rmean - grand)^2)), B = sqrt(mean((cmean - grand)^2)),
    AB = sqrt(mean((x$means - outer(rmean, cmean, "+") + grand)^2))
  ) / x$sd
  df1 <- switch(x$effect, A = a - 1, B = b - 1, AB = (a - 1) * (b - 1))
  pw <- function(n) fpower(f^2 * a * b * n, df1, a * b * n - a * b, 0.05)
  n <- first_n(pw, 0.8, 2)
  list(means = x$means, sd = x$sd, effect = x$effect, f = f, n = n, power = pw(n), simPower = sim_factorial(x$means, x$sd, n, x$effect))
})

out$ancovaSim <- lapply(list(c(10, 12, 13.5), c(20, 23)), function(means) {
  sd <- 6; r <- 0.6; k <- length(means)
  f <- sqrt(mean((means - mean(means))^2)) / (sd * sqrt(1 - r^2))
  pw <- function(n) fpower(f^2 * k * n, k - 1, k * n - k - 1, 0.05)
  n <- first_n(pw, 0.8, 2)
  g <- factor(rep(seq_len(k), each = n))
  sim <- mean(replicate(4000, {
    x <- rnorm(k * n)
    y <- means[g] + sd * (r * x + sqrt(1 - r^2) * rnorm(k * n))
    anova(lm(y ~ x + g))["g", "Pr(>F)"] < 0.05
  }))
  list(means = means, sd = sd, r = r, n = n, power = pw(n), simPower = sim)
})

# ---- Logistic regression: Demidenko (2007) with variance correction ----
demidenko <- function(p0, or, x, share, r2, n, alpha = 0.05) {
  b0 <- qlogis(p0); b1 <- log(or)
  w <- function(z) { p <- plogis(b0 + b1 * z); p * (1 - p) }
  # Under H0 the slope is 0 and everyone has the overall event rate pbar.
  if (x == "binary") {
    i00 <- (1 - share) * w(0) + share * w(1); i01 <- i11 <- share * w(1); vx <- share * (1 - share)
    pbar <- (1 - share) * p0 + share * plogis(b0 + b1)
  } else {
    i00 <- integrate(function(z) w(z) * dnorm(z), -Inf, Inf, rel.tol = 1e-12)$value
    i01 <- integrate(function(z) z * w(z) * dnorm(z), -Inf, Inf, rel.tol = 1e-12)$value
    i11 <- integrate(function(z) z^2 * w(z) * dnorm(z), -Inf, Inf, rel.tol = 1e-12)$value
    pbar <- integrate(function(z) plogis(b0 + b1 * z) * dnorm(z), -Inf, Inf, rel.tol = 1e-12)$value
    vx <- 1
  }
  v1 <- i00 / (i00 * i11 - i01^2); v0 <- 1 / (pbar * (1 - pbar) * vx)
  z <- qnorm(1 - alpha / 2); root <- sqrt(n * (1 - r2))
  pnorm((abs(b1) * root - z * sqrt(v0)) / sqrt(v1)) + pnorm((-abs(b1) * root - z * sqrt(v0)) / sqrt(v1))
}
grid <- expand.grid(x = c("binary", "normal"), p0 = c(0.1, 0.3, 0.5), or = c(0.5, 1.5, 2.5), share = c(0.2, 0.5), r2 = c(0, 0.3), power = 0.8, stringsAsFactors = FALSE)
grid <- grid[!(grid$x == "normal" & grid$share != 0.5), ]
res <- t(mapply(function(x, p0, or, share, r2, power) {
  pw <- function(n) demidenko(p0, or, x, share, r2, n)
  n <- first_n(pw, power, 10)
  c(n = n, achieved = pw(n))
}, grid$x, grid$p0, grid$or, grid$share, grid$r2, grid$power))
out$logit <- cbind(grid, res)

out$logitSim <- lapply(list(
  list(x = "binary", p0 = 0.2, or = 2, share = 0.4),
  list(x = "binary", p0 = 0.4, or = 0.5, share = 0.3),
  list(x = "normal", p0 = 0.3, or = 1.6, share = 0.5),
  list(x = "normal", p0 = 0.1, or = 2, share = 0.5)
), function(s) {
  pw <- function(n) demidenko(s$p0, s$or, s$x, s$share, 0, n)
  n <- first_n(pw, 0.8, 10)
  sim <- mean(replicate(10000, {
    x <- if (s$x == "binary") rbinom(n, 1, s$share) else rnorm(n)
    y <- rbinom(n, 1, plogis(qlogis(s$p0) + log(s$or) * x))
    fit <- suppressWarnings(glm(y ~ x, family = binomial))
    co <- summary(fit)$coefficients
    nrow(co) == 2 && co[2, 4] < 0.05
  }))
  c(s, list(n = n, power = pw(n), simPower = sim))
})

# ---- McNemar: exact binomial test on the discordant pairs, unconditional power ----
mcnemar_power <- function(p1, p2, disc, n, alpha = 0.05, sides = 2) {
  pi1 <- (disc + abs(p1 - p2)) / (2 * disc)
  a <- alpha / sides
  d <- 1:n
  c_lo <- qbinom(a, d, 0.5) - 1            # largest c with P(X <= c) <= a ...
  c_lo <- ifelse(pbinom(c_lo + 1, d, 0.5) <= a, c_lo + 1, c_lo)
  rej <- ifelse(c_lo < 0, 0, 1 - pbinom(d - c_lo - 1, d, pi1) + if (sides == 2) pbinom(c_lo, d, pi1) else 0)
  sum(dbinom(d, n, disc) * rej)
}
grid <- expand.grid(p1 = c(0.3, 0.5), diff = c(0.1, 0.2), disc = c(0.25, 0.4), power = c(0.8, 0.9), sides = c(1, 2))
grid$p2 <- grid$p1 - grid$diff
res <- t(mapply(function(p1, p2, disc, power, sides) {
  pw <- function(n) mcnemar_power(p1, p2, disc, n, sides = sides)
  n <- first_n(pw, power, 2)
  c(n = n, achieved = pw(n))
}, grid$p1, grid$p2, grid$disc, grid$power, grid$sides))
out$mcnemar <- cbind(grid, res)

out$mcnemarSim <- lapply(list(c(0.4, 0.25, 0.35), c(0.6, 0.45, 0.3)), function(x) {
  p1 <- x[1]; p2 <- x[2]; disc <- x[3]
  pw <- function(n) mcnemar_power(p1, p2, disc, n)
  n <- first_n(pw, 0.8, 2)
  b <- (disc + p1 - p2) / 2; c <- (disc - p1 + p2) / 2
  cells <- rmultinom(20000, n, c(b, c, 1 - b - c))
  p <- mapply(function(b, c) if (b + c == 0) 1 else binom.test(b, b + c)$p.value, cells[1, ], cells[2, ])
  list(p1 = p1, p2 = p2, disc = disc, n = n, power = pw(n), simPower = mean(p < 0.05))
})

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
