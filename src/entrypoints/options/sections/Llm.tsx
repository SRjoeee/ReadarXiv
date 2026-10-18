// The LLM group (the redesign's design, §6.3): headed LLM (S.service.llm) with the aside that says what it reaches, holding the
// prompts and the glossary; with no LLM service, one line that says how to have them. The prompts and the glossary
// stay the reader's while a free service is chosen: only an LLM reads them
import { useState } from 'react'
import { Reveal } from '@/ui/controls/Reveal'
import { O, S } from '@/ui/strings'
import type { OptionsData } from '../data'
import { Card, GroupHeading } from '../ui/Card'
import { Row, Value } from '../ui/Row'
import { GlossaryTable } from './Glossary'
import { PromptsRow } from './Prompts'

export function Llm({ data }: { data: OptionsData }) {
  const config = data.config
  if (!config) return null
  if (config.services.length === 0) {
    return (
      <>
        <GroupHeading title={S.service.llm} />
        <Card><Row quiet label={O.llm.empty} /></Card>
      </>
    )
  }
  return (
    <>
      <GroupHeading title={S.service.llm} aside={O.llm.aside} />
      <Card>
        <PromptsRow data={data} />
        <GlossaryRow data={data} />
      </Card>
    </>
  )
}

function GlossaryRow({ data }: { data: OptionsData }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Row kind="button" row="translate/glossary" words={O.search.keywords['translate/glossary']} label={O.glossary.title} description={O.glossary.hint}
        trailing={<Value>{O.glossary.count(data.config!.glossary.length)}</Value>} expanded={open} onPress={() => setOpen(o => !o)} />
      <Reveal open={open}>
        <GlossaryTable data={data} />
        <p className="o-gloss-hint">{O.glossary.paste}</p>
      </Reveal>
    </>
  )
}
