# Reference values for the /analize statistics, computed with standard R functions.
#
# Writes src/stats/reference.json, which src/stats/reference.test.ts compares
# against the app's raw `stats` (to 4 significant decimals). Re-run only when a
# test is added or its definition changes:
#
#   cd _analize-src
#   npx vite-node scripts/export-datasets.ts   # demo rows -> scripts/.cache/*.json
#   Rscript scripts/reference.R
#
# Each case is list(id, test, dataset, picks, [prep], expect = list(stat = value)).
# `prep` steps are applied by the app's prep pipeline before the test runs; the
# R side reproduces them by hand in `data`.

suppressPackageStartupMessages(library(jsonlite))

load_ds <- function(id) {
  d <- fromJSON(file.path("scripts/.cache", paste0(id, ".json")))
  as.data.frame(d)
}
ds <- list(birthwt = load_ds("birthwt"), cps1985 = load_ds("cps1985"), apklausa = load_ds("apklausa"))

cases <- list()
add <- function(id, test, dataset, picks, expect, prep = NULL) {
  case <- list(id = id, test = test, dataset = dataset, picks = picks,
               expect = lapply(expect, unname))
  if (!is.null(prep)) case$prep <- prep
  cases[[length(cases) + 1]] <<- case
}

# Groups in the app are sorted by raw value as a string; mirror that.
grp <- function(x) factor(as.character(x), levels = sort(unique(as.character(na.omit(x)))))

# ---------- descriptives ----------
desc_case <- function(id, dsid, v) {
  x <- na.omit(ds[[dsid]][[v]])
  q <- quantile(x, c(.25, .75), type = 7)
  add(id, "descriptives", dsid, list(var = v), list(
    n = length(x), mean = mean(x), sd = sd(x), median = median(x),
    q1 = q[[1]], q3 = q[[2]], min = min(x), max = max(x)))
}
desc_case("desc-bwt", "birthwt", "bwt")
desc_case("desc-miegas", "apklausa", "miegas")

# ---------- Welch t-test ----------
ttest_case <- function(id, dsid, y, g) {
  d <- ds[[dsid]]; d <- d[!is.na(d[[y]]) & !is.na(d[[g]]), ]
  f <- grp(d[[g]])
  tt <- t.test(d[[y]] ~ f)
  a <- d[[y]][f == levels(f)[1]]; b <- d[[y]][f == levels(f)[2]]
  sp <- sqrt(((length(a) - 1) * var(a) + (length(b) - 1) * var(b)) / (length(a) + length(b) - 2))
  add(id, "ttest", dsid, list(outcome = y, group = g), list(
    t = tt$statistic, df = tt$parameter, p = tt$p.value,
    diff = mean(a) - mean(b), ciLo = tt$conf.int[1], ciHi = tt$conf.int[2],
    d = (mean(a) - mean(b)) / sp))
}
ttest_case("ttest-bwt-smoke", "birthwt", "bwt", "smoke")
ttest_case("ttest-wage-gender", "cps1985", "wage", "gender")
ttest_case("ttest-miegas-dirba", "apklausa", "miegas", "dirba")

# ---------- one-way ANOVA ----------
anova_case <- function(id, dsid, y, g) {
  d <- ds[[dsid]]; d <- d[!is.na(d[[y]]) & !is.na(d[[g]]), ]
  fit <- summary(aov(d[[y]] ~ grp(d[[g]])))[[1]]
  add(id, "anova", dsid, list(outcome = y, group = g), list(
    F = fit$`F value`[1], df1 = fit$Df[1], df2 = fit$Df[2], p = fit$`Pr(>F)`[1],
    eta2 = fit$`Sum Sq`[1] / sum(fit$`Sum Sq`)))
}
anova_case("anova-bwt-race", "birthwt", "bwt", "race")
anova_case("anova-vidurkis-sritis", "apklausa", "vidurkis", "sritis")

# ---------- chi-square ----------
chisq_case <- function(id, dsid, r, c) {
  d <- ds[[dsid]]; d <- d[!is.na(d[[r]]) & !is.na(d[[c]]), ]
  tab <- table(grp(d[[r]]), grp(d[[c]]))
  ct <- suppressWarnings(chisq.test(tab, correct = FALSE))
  add(id, "chisq", dsid, list(rowVar = r, colVar = c), list(
    chi2 = ct$statistic, df = ct$parameter, p = ct$p.value,
    V = sqrt(ct$statistic / (sum(tab) * (min(dim(tab)) - 1))), n = sum(tab)))
}
chisq_case("chisq-low-smoke", "birthwt", "low", "smoke")
chisq_case("chisq-dirba-kursas", "apklausa", "dirba", "kursas")

# ---------- Pearson correlation ----------
cor_case <- function(id, dsid, x, y) {
  d <- ds[[dsid]]; d <- d[!is.na(d[[x]]) & !is.na(d[[y]]), ]
  ct <- cor.test(d[[x]], d[[y]])
  add(id, "correlation", dsid, list(x = x, y = y), list(
    r = ct$estimate, t = ct$statistic, df = ct$parameter, p = ct$p.value, n = nrow(d)))
}
cor_case("cor-lwt-bwt", "birthwt", "lwt", "bwt")
cor_case("cor-miegas-vidurkis", "apklausa", "miegas", "vidurkis")

# ---------- simple regression ----------
d <- ds$birthwt
fit <- lm(bwt ~ lwt, d); s <- summary(fit)
add("reg-bwt-lwt", "regression", "birthwt", list(outcome = "bwt", predictor = "lwt"), list(
  intercept = coef(fit)[1], slope = coef(fit)[2], seSlope = s$coefficients[2, 2],
  t = s$coefficients[2, 3], p = s$coefficients[2, 4], r2 = s$r.squared, F = s$fstatistic[1]))

# ---------- multiple regression ----------
mreg_case <- function(id, dsid, y, xs) {
  d <- ds[[dsid]]; d <- d[complete.cases(d[, c(y, xs)]), ]
  fit <- lm(reformulate(xs, y), d); s <- summary(fit)
  fs <- s$fstatistic
  ex <- list(r2 = s$r.squared, adjR2 = s$adj.r.squared, F = fs[1],
             p = pf(fs[1], fs[2], fs[3], lower.tail = FALSE))
  for (j in seq_along(coef(fit))) {
    ex[[paste0("b", j - 1)]] <- coef(fit)[j]
    ex[[paste0("se", j - 1)]] <- s$coefficients[j, 2]
  }
  add(id, "multiple_regression", dsid, list(outcome = y, predictors = paste(xs, collapse = ",")), ex)
}
mreg_case("mreg-bwt", "birthwt", "bwt", c("age", "lwt"))
mreg_case("mreg-vidurkis", "apklausa", "vidurkis", c("miegas", "amzius", "savijauta_pries"))

# ---------- logistic regression ----------
d <- ds$birthwt
fit <- glm(low ~ age + lwt + smoke, family = binomial, data = d)
null <- glm(low ~ 1, family = binomial, data = d)
n <- nrow(d)
ll <- as.numeric(logLik(fit)); ll0 <- as.numeric(logLik(null))
cs <- 1 - exp((2 / n) * (ll0 - ll))
ex <- list(lrChi2 = 2 * (ll - ll0), p = pchisq(2 * (ll - ll0), 3, lower.tail = FALSE),
           nagelkerke = cs / (1 - exp((2 / n) * ll0)), logLik = ll)
sm <- summary(fit)$coefficients
for (j in seq_len(nrow(sm))) {
  ex[[paste0("b", j - 1)]] <- sm[j, 1]
  ex[[paste0("se", j - 1)]] <- sm[j, 2]
}
add("logit-low", "logistic", "birthwt", list(outcome = "low", predictors = "age,lwt,smoke"), ex)

# ---------- Mann–Whitney ----------
# SPSS reports the tie-corrected normal approximation without continuity correction.
mw_case <- function(id, dsid, y, g) {
  d <- ds[[dsid]]; d <- d[!is.na(d[[y]]) & !is.na(d[[g]]), ]
  f <- grp(d[[g]])
  a <- d[[y]][f == levels(f)[1]]; b <- d[[y]][f == levels(f)[2]]
  wt <- wilcox.test(a, b, exact = FALSE, correct = FALSE)
  U <- min(wt$statistic, length(a) * length(b) - wt$statistic)
  z <- -qnorm(wt$p.value / 2, lower.tail = FALSE)
  add(id, "mannwhitney", dsid, list(outcome = y, group = g), list(
    U = U, z = z, p = wt$p.value, r = abs(z) / sqrt(length(a) + length(b))))
}
mw_case("mw-bwt-smoke", "birthwt", "bwt", "smoke")
mw_case("mw-S1-lytis", "apklausa", "S1", "lytis")

# ---------- Cronbach's alpha (base-R formulas, listwise deletion) ----------
alpha_of <- function(x) { k <- ncol(x); (k / (k - 1)) * (1 - sum(apply(x, 2, var)) / var(rowSums(x))) }
alpha_case <- function(id, dsid, items, reverse = character(0), lo = 1, hi = 5) {
  d <- ds[[dsid]][, items]
  for (k in reverse) d[[k]] <- lo + hi - d[[k]]
  d <- na.omit(d)
  R <- cor(d); rbar <- mean(R[lower.tri(R)]); k <- length(items)
  ex <- list(alpha = alpha_of(d), alphaStd = k * rbar / (1 + (k - 1) * rbar),
             n = nrow(d), k = k, rBar = rbar)
  for (j in items) {
    ex[[paste0("rDrop_", j)]] <- cor(d[[j]], rowSums(d[, setdiff(items, j)]))
    if (k > 2) ex[[paste0("alphaDrop_", j)]] <- alpha_of(d[, setdiff(items, j)])
  }
  prep <- if (length(reverse)) list(list(kind = "reverse", id = "r", variables = reverse, min = lo, max = hi)) else NULL
  add(id, "cronbach", dsid, list(items = paste(items, collapse = ",")), ex, prep)
}
alpha_case("alpha-stress-raw", "apklausa", paste0("S", 1:6))
alpha_case("alpha-stress", "apklausa", paste0("S", 1:6), reverse = c("S3", "S5"))
alpha_case("alpha-satisf", "apklausa", paste0("P", 1:8), reverse = c("P2", "P6"))

# ---------- Spearman (t approximation, as SPSS) ----------
sp_case <- function(id, dsid, x, y) {
  d <- ds[[dsid]]; d <- d[!is.na(d[[x]]) & !is.na(d[[y]]), ]
  ct <- suppressWarnings(cor.test(d[[x]], d[[y]], method = "spearman", exact = FALSE))
  rho <- unname(ct$estimate); n <- nrow(d)
  add(id, "spearman", dsid, list(x = x, y = y), list(
    rho = rho, p = ct$p.value, n = n, df = n - 2, t = rho * sqrt((n - 2) / (1 - rho^2))))
}
sp_case("spearman-S1-P1", "apklausa", "S1", "P1")
sp_case("spearman-age-bwt", "birthwt", "age", "bwt")

# ---------- correlation matrix (pairwise deletion) ----------
cm_case <- function(id, dsid, vars, method) {
  d <- ds[[dsid]]; ex <- list()
  for (i in seq_along(vars)) for (j in seq_len(i - 1)) {
    a <- vars[i]; b <- vars[j]; dd <- d[!is.na(d[[a]]) & !is.na(d[[b]]), ]
    ct <- suppressWarnings(cor.test(dd[[a]], dd[[b]], method = method, exact = FALSE))
    ex[[paste0("r_", a, "_", b)]] <- unname(ct$estimate)
    ex[[paste0("p_", a, "_", b)]] <- ct$p.value
  }
  add(id, "cormatrix", dsid, list(vars = paste(vars, collapse = ","), method = method), ex)
}
cm_case("cormatrix-pearson", "apklausa", c("miegas", "vidurkis", "savijauta_pries", "amzius"), "pearson")
cm_case("cormatrix-spearman", "apklausa", c("S1", "S2", "P1", "P4", "miegas"), "spearman")

# ---------- paired t-test and Wilcoxon signed-rank (difference = second − first) ----------
pt_case <- function(id, dsid, a, b) {
  d <- ds[[dsid]]; d <- d[!is.na(d[[a]]) & !is.na(d[[b]]), ]
  tt <- t.test(d[[b]], d[[a]], paired = TRUE); dif <- d[[b]] - d[[a]]
  add(id, "paired_ttest", dsid, list(first = a, second = b), list(
    t = tt$statistic, df = tt$parameter, p = tt$p.value, meanDiff = mean(dif),
    ciLo = tt$conf.int[1], ciHi = tt$conf.int[2], dz = mean(dif) / sd(dif), n = nrow(d)))
}
pt_case("paired-savijauta", "apklausa", "savijauta_pries", "savijauta_po")
pt_case("paired-S1-S2", "apklausa", "S1", "S2")

wx_case <- function(id, dsid, a, b) {
  d <- ds[[dsid]]; d <- d[!is.na(d[[a]]) & !is.na(d[[b]]), ]
  wt <- suppressWarnings(wilcox.test(d[[b]], d[[a]], paired = TRUE, exact = FALSE, correct = FALSE))
  n <- sum(d[[b]] != d[[a]])
  z <- qnorm(wt$p.value / 2, lower.tail = FALSE) * sign(wt$statistic - n * (n + 1) / 4)
  add(id, "wilcoxon", dsid, list(first = a, second = b), list(
    V = wt$statistic, z = z, p = wt$p.value, r = abs(z) / sqrt(n), n = n))
}
wx_case("wilcoxon-savijauta", "apklausa", "savijauta_pries", "savijauta_po")
wx_case("wilcoxon-S1-S2", "apklausa", "S1", "S2")

# ---------- Kruskal–Wallis + Dunn (Holm, two-sided) ----------
suppressPackageStartupMessages(library(dunn.test))
kw_case <- function(id, dsid, y, g) {
  d <- ds[[dsid]]; d <- d[!is.na(d[[y]]) & !is.na(d[[g]]), ]
  f <- grp(d[[g]]); kt <- kruskal.test(d[[y]], f); N <- nrow(d)
  ex <- list(H = kt$statistic, df = kt$parameter, p = kt$p.value, eps2 = kt$statistic / (N - 1))
  if (nlevels(f) >= 3) {
    invisible(capture.output(dt <- dunn.test(d[[y]], f, method = "holm", altp = TRUE)))
    lv <- levels(f); idx <- 0
    for (i in seq_along(lv)) for (j in seq_along(lv)) if (i < j) {
      lab <- paste(lv[i], "-", lv[j]); m <- match(lab, dt$comparisons)
      sgn <- 1
      if (is.na(m)) { m <- match(paste(lv[j], "-", lv[i]), dt$comparisons); sgn <- -1 }
      ex[[paste0("dunnZ_", idx)]] <- sgn * dt$Z[m]
      ex[[paste0("dunnP_", idx)]] <- dt$altP[m]  # raw two-sided p; Holm-adjusted below
      idx <- idx + 1
    }
    # dunn.test's own Holm column is not monotone; use the standard step-down (p.adjust).
    pk <- grep("^dunnP_", names(ex))
    ex[pk] <- as.list(p.adjust(unlist(ex[pk]), method = "holm"))
  }
  add(id, "kruskal", dsid, list(outcome = y, group = g), ex)
}
kw_case("kruskal-S1-sritis", "apklausa", "S1", "sritis")
kw_case("kruskal-bwt-race", "birthwt", "bwt", "race")
kw_case("kruskal-vidurkis-dirba", "apklausa", "vidurkis", "dirba")

# ---------- ANOVA post-hoc: Tukey HSD or Games–Howell, chosen by Brown–Forsythe Levene ----------
suppressPackageStartupMessages(library(car))
ph_case <- function(id, dsid, y, g) {
  d <- ds[[dsid]]; d <- d[!is.na(d[[y]]) & !is.na(d[[g]]), ]
  f <- grp(d[[g]]); fit <- aov(d[[y]] ~ f); s <- summary(fit)[[1]]
  lev <- leveneTest(d[[y]], f, center = median)$`Pr(>F)`[1]
  ex <- list(F = s$`F value`[1], p = s$`Pr(>F)`[1])
  if (lev < 0.05) {
    # rstatix::games_howell_test rounds p.adj, so apply its formula with R's ptukey directly.
    lv <- levels(f); idx <- 0
    for (i in seq_along(lv)) for (j in seq_along(lv)) if (i < j) {
      a <- d[[y]][f == lv[i]]; b <- d[[y]][f == lv[j]]
      va <- var(a) / length(a); vb <- var(b) / length(b)
      dfw <- (va + vb)^2 / (va^2 / (length(a) - 1) + vb^2 / (length(b) - 1))
      q <- abs(mean(a) - mean(b)) / sqrt((va + vb) / 2)
      ex[[paste0("postP_", idx)]] <- ptukey(q, length(lv), dfw, lower.tail = FALSE)
      idx <- idx + 1
    }
    method <- "games-howell"
  } else {
    tk <- TukeyHSD(fit)$f
    for (i in seq_len(nrow(tk))) ex[[paste0("postP_", i - 1)]] <- tk[i, "p adj"]
    method <- "tukey"
  }
  cat(id, ": Levene p =", round(lev, 4), "->", method, "
")
  add(id, "anova", dsid, list(outcome = y, group = g), ex)
}
ph_case("posthoc-bwt-race", "birthwt", "bwt", "race")
ph_case("posthoc-vidurkis-sritis", "apklausa", "vidurkis", "sritis")
ph_case("posthoc-wage-occupation", "cps1985", "wage", "occupation")

write_json(cases, "src/stats/reference.json", auto_unbox = TRUE, digits = NA, pretty = TRUE)
cat("Wrote", length(cases), "reference cases.\n")
