'use strict';

function reportTablesMarkdown(tables=[]) {
    return (tables || []).map(table=>{
        const header=`| ${table.columns.join(' | ')} |\n| ${table.columns.map(()=>'---').join(' | ')} |`;
        const rows=table.rows.map(row=>`| ${row.map(value=>String(value).replace(/\|/g,'/')).join(' | ')} |`).join('\n');
        return `## ${table.title}\n${header}\n${rows}${table.note ? `\n\nNota: ${table.note}` : ''}`;
    }).join('\n\n');
}

module.exports={reportTablesMarkdown};
