# Renders the IST-1 sample report and copies the published files next to the
# web page (../). Run from this folder:  Rscript render.R
# Needs the statistikas package (C:/Users/alabu/repos/statistikas) installed.
out <- statistikas::render_report("ist-1.qmd", formats = c("docx", "pdf"))
file.copy(out[["pdf"]], "../ist-1-ataskaita.pdf", overwrite = TRUE)
file.copy(out[["docx"]], "../ist-1-ataskaita.docx", overwrite = TRUE)
message("Copied to ../ist-1-ataskaita.pdf and ../ist-1-ataskaita.docx")
