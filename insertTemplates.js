import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hakysnqiryimxbwdslwe.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDIyNzQsImV4cCI6MjA4NTYxODI3NH0.-85OS1dohc9gh4U4qBhEBlqHi9Bq7l7H6JnzcUzrCIg';
const supabase = createClient(supabaseUrl, supabaseKey);

const newTemplates = [
  {
    shortcut: '/prevenir',
    label: 'Programa Prevenir',
    category: 'info',
    is_active: true,
    sort_order: 1,
    message: 'Hola {nombre}, el Programa Prevenir se realiza para la detección precoz de cáncer de cuello uterino destinado a las afiliadas de D.O.S. Comprendidas entre 25 y 70 años de edad.\nEl mismo comprende lo que es la 1era consulta + el pap + la mamografía y la 2da consulta para mostrar estudios sin cargo. Todo se realiza en el mismo circuito al momento del turno.\n\nSi desea solicitar un turno debe enviar los siguientes datos:\n- Nombre y Apellido\n- DNI\n- Obra social\n- Horario de preferencia: mañana de (8:00hs a 10:00hs), siesta de (13:00hs a 15:00hs), tarde de (17:00hs a 18:30hs)'
  },
  {
    shortcut: '/requisitosprevenir',
    label: 'Requisitos Prevenir',
    category: 'info',
    is_active: true,
    sort_order: 2,
    message: 'Hola {nombre}, IMPORTANTE: Requisitos para realizarse el Papanicolaou:\n* No estar en el período menstrual.\n* No haber tenido relaciones sexuales las 48 horas anteriores.\n* No haberse realizado duchas vaginales en el lapso de 48 horas antes.\n* No haberse aplicado ningún tratamiento médico vaginal (óvulos o cremas), durante las últimas 48 horas.\n* No tener infección vaginal.\n\nA fin de asegurarse de que los resultados de la prueba de Papanicolaou sean lo más precisos posible. El mejor momento para programar su prueba de Papanicolaou es al menos 3 días después del final de su período menstrual.'
  },
  {
    shortcut: '/chequeo',
    label: 'Invitación Chequeo',
    category: 'general',
    is_active: true,
    sort_order: 3,
    message: 'Buen día {nombre}, me comunico del Sanatorio Argentino para recordarle que puede realizarse en nuestras sedes el chequeo clínico correspondiente a este año.\n\nTu salud primero: Hacé tu chequeo anual.\nPara agendar un turno, responda este msj.'
  },
  {
    shortcut: '/infochequeo',
    label: 'Información Chequeo',
    category: 'info',
    is_active: true,
    sort_order: 4,
    message: 'Hola {nombre}, el Chequeo Anual Preventivo es un Circuito que se realiza para la detección temprana de factores de riesgo y enfermedades.\n\nComprende la consulta con un médico clínico, cardiólogo, laboratorio, diagnóstico por imagen y todo lo que necesite dependiendo de su cuadro clínico al momento de la consulta.'
  },
  {
    shortcut: '/duracionchequeo',
    label: 'Duración del Chequeo',
    category: 'info',
    is_active: true,
    sort_order: 5,
    message: '{nombre}, el circuito dura entre tres a cuatro horas o un poco más, por eso es IMPORTANTE que el día de su turno cuente con disponibilidad horaria en la mañana.'
  },
  {
    shortcut: '/valorchequeo',
    label: 'Valor del Chequeo',
    category: 'info',
    is_active: true,
    sort_order: 6,
    message: '{nombre}, el chequeo anual preventivo de forma particular está en un estimado de {valor_chequeo} por el momento. Es un estimativo porque el valor exacto va a depender de la cantidad de estudios que le indique la médica clínica al momento de la consulta.'
  },
  {
    shortcut: '/recordatorio',
    label: 'Recordatorio de Turno',
    category: 'confirmacion',
    is_active: true,
    sort_order: 7,
    message: 'Buen día {nombre}, me comunico del Sanatorio Argentino para recordarle su turno de chequeo el día {fecha_turno} a las {hora_turno}.\n\nDebe venir en ayunas y debe traer en un frasquito la 1era orina de la mañana.\nLa/o esperamos en Sede {sede}. Por favor, confirmar asistencia.'
  }
];

async function insertTemplates() {
    console.log('Inserting templates...');
    const { data, error } = await supabase
        .from('whatsapp_shortcuts')
        .insert(newTemplates);
        
    if (error) {
        console.error('Error inserting:', error);
    } else {
        console.log('Templates inserted successfully!');
    }
}

insertTemplates();
