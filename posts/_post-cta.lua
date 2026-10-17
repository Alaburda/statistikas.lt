-- Appends a closing call to action to blog posts that don't already link to the
-- contact page. Runs after code execution, so frozen posts are not re-run.
-- Opt out per post with `post-cta: false` in the frontmatter.

local CTA = [[
<aside class="post-cta">
  <p class="post-cta-title">Reikia pagalbos su savo duomenimis?</p>
  <p>Padėsiu pasirinkti tinkamą metodą, atlikti analizę ir aiškiai pateikti rezultatus — verslo sprendimui ar publikacijai. Pirmas pokalbis nemokamas.</p>
  <p class="post-cta-actions">
    <a class="btn-blue" href="../../kontaktai.html">Susisiekti</a>
    <a class="text-link" href="../../analize/">Išbandyti nemokamą analizę</a>
  </p>
</aside>
]]

function Pandoc(doc)
  if doc.meta["post-cta"] == false then return nil end

  local has_contact = false
  pandoc.walk_block(pandoc.Div(doc.blocks), {
    Link = function(link)
      if link.target:find("kontaktai") then has_contact = true end
    end,
  })
  if has_contact then return nil end

  doc.blocks:insert(pandoc.RawBlock("html", CTA))
  return doc
end
