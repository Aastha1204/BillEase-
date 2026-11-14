import { toPaise } from '../domain/money';
import { makeGstin } from '../domain/gstin';
import type { Business, Customer, Item } from '../domain/entities';
import type { Rng } from './prng';
import { SSE_LOGO, SSE_SIGNATURE } from './assets';

export const BUSINESS: Business = {
  id: 'biz-sse',
  tradeName: 'Shree Sai Electricals',
  legalName: 'Shree Sai Electricals (Partnership Firm)',
  constitution: 'Partnership firm',
  address: 'Shop No. 4, Sai Darshan Complex, Station Road, Kalyan West',
  city: 'Thane',
  stateCode: '27',
  pincode: '421301',
  gstin: '27ABJFS4821K1ZT',
  phone: '+91 90000 01001',
  email: 'accounts@shreesai.example',
  seriesPrefix: 'SSE',
  bankName: 'Demo Co-operative Bank',
  bankAccountMasked: 'XXXXXXXX4417',
  bankBranch: 'Kalyan West Branch',
  ifsc: 'DEMO0001234',
  upiId: 'shreesai@demo',
  signatoryName: 'Ramesh Patil, Partner',
  logoSvg: SSE_LOGO,
  signatureSvg: SSE_SIGNATURE,
  settings: {
    roundOff: true,
    b2cBasis: 'grand',
    b2cThreshold: 5_000_000,
    b2clThreshold: 10_000_000,
    defaultTermsDays: 15,
    demoQrWatermark: true,
    pdfTemplate: 'Standard',
  },
};

// name, hsn, unit, rate, gst, category
type Row = [string, string, string, string, number, string];
const ITEM_ROWS: Row[] = [
  ['FR PVC Wire 1.5 sq mm (90 m coil)', '8544', 'Coil', '1450.00', 18, 'Wires & Cables'],
  ['FR PVC Wire 2.5 sq mm (90 m coil)', '8544', 'Coil', '2280.00', 18, 'Wires & Cables'],
  ['Modular Switch 6A 1-Way', '8536', 'Pcs', '38.50', 18, 'Switches & Sockets'],
  ['Modular Socket 6A 3-Pin', '8536', 'Pcs', '74.00', 18, 'Switches & Sockets'],
  ['MCB 32A Double Pole', '8536', 'Pcs', '612.00', 18, 'Protection'],
  ['RCCB 40A 30mA 4-Pole', '8536', 'Pcs', '2950.00', 18, 'Protection'],
  ['8-Way Distribution Board', '8537', 'Pcs', '1890.00', 18, 'Distribution Boards'],
  ['LED Panel 18W Round Recessed', '9405', 'Pcs', '465.00', 18, 'Lighting'],
  ['LED Batten 20W 4 ft', '9405', 'Pcs', '289.00', 18, 'Lighting'],
  ['Ceiling Fan 1200 mm', '8414', 'Pcs', '1790.00', 18, 'Fans'],
  ['Solar Street Light 30W All-in-One', '9405', 'Pcs', '6850.00', 5, 'Lighting'],
  ['PVC Conduit Pipe 25 mm (3 m)', '3917', 'Length', '62.00', 18, 'Conduits'],
  ['Electrical Installation Service', '9954', 'Job', '2500.00', 18, 'Services'],
  // generated, same categories
  ['FR PVC Wire 4 sq mm (90 m coil)', '8544', 'Coil', '3480.00', 18, 'Wires & Cables'],
  ['FR PVC Wire 0.75 sq mm (90 m coil)', '8544', 'Coil', '980.00', 18, 'Wires & Cables'],
  ['Flexible Copper Cable 3-Core 1.5 sq mm', '8544', 'Metre', '62.00', 18, 'Wires & Cables'],
  ['Modular Switch 16A 1-Way', '8536', 'Pcs', '62.00', 18, 'Switches & Sockets'],
  ['Modular Socket 16A 3-Pin', '8536', 'Pcs', '128.00', 18, 'Switches & Sockets'],
  ['Modular Fan Regulator 5-Step', '8536', 'Pcs', '340.00', 18, 'Switches & Sockets'],
  ['Modular Cover Plate 8-Module', '8538', 'Pcs', '96.00', 18, 'Switches & Sockets'],
  ['MCB 16A Single Pole', '8536', 'Pcs', '245.00', 18, 'Protection'],
  ['MCB 63A Triple Pole', '8536', 'Pcs', '1140.00', 18, 'Protection'],
  ['RCBO 25A 30mA', '8536', 'Pcs', '1780.00', 18, 'Protection'],
  ['Isolator 63A 4-Pole', '8536', 'Pcs', '1320.00', 18, 'Protection'],
  ['4-Way Distribution Board', '8537', 'Pcs', '980.00', 18, 'Distribution Boards'],
  ['12-Way Distribution Board', '8537', 'Pcs', '3120.00', 18, 'Distribution Boards'],
  ['LED Bulb 9W B22', '9405', 'Pcs', '78.00', 18, 'Lighting'],
  ['LED Bulb 12W B22', '9405', 'Pcs', '105.00', 18, 'Lighting'],
  ['LED Panel 36W Square', '9405', 'Pcs', '890.00', 18, 'Lighting'],
  ['LED Flood Light 50W', '9405', 'Pcs', '1240.00', 18, 'Lighting'],
  ['LED Downlight 12W', '9405', 'Pcs', '295.00', 18, 'Lighting'],
  ['Solar Street Light 60W All-in-One', '9405', 'Pcs', '11250.00', 5, 'Lighting'],
  ['Solar Garden Light', '9405', 'Pcs', '1950.00', 5, 'Lighting'],
  ['Exhaust Fan 250 mm', '8414', 'Pcs', '1350.00', 18, 'Fans'],
  ['Pedestal Fan 400 mm', '8414', 'Pcs', '2150.00', 18, 'Fans'],
  ['PVC Conduit Pipe 20 mm (3 m)', '3917', 'Length', '48.00', 18, 'Conduits'],
  ['PVC Conduit Pipe 32 mm (3 m)', '3917', 'Length', '96.00', 18, 'Conduits'],
  ['PVC Junction Box 4x4', '3917', 'Pcs', '18.00', 18, 'Conduits'],
  ['Wiring Service (per point)', '9954', 'Point', '450.00', 18, 'Services'],
  ['Annual Maintenance Contract', '9987', 'Job', '6500.00', 18, 'Services'],
];

export function buildItems(today: string, daysAgo: (n: number) => string): Item[] {
  return ITEM_ROWS.map((r, i) => {
    const base = { effectiveFrom: '2025-04-01', ratePaise: toPaise(r[3]), gstRate: r[4] };
    const rates = [base];
    // Demo of rate history: ceiling fan price rose 45 days ago.
    if (r[0] === 'Ceiling Fan 1200 mm') {
      rates[0] = { ...base, ratePaise: toPaise('1690.00') };
      rates.push({ effectiveFrom: daysAgo(45), ratePaise: toPaise('1790.00'), gstRate: 18 });
    }
    void today;
    return { id: `item-${String(i + 1).padStart(2, '0')}`, name: r[0], hsn: r[1], unit: r[2], category: r[5], rates, caVerified: false };
  });
}

const GIVEN: Omit<Customer, 'id'>[] = [
  { name: 'Patel Interiors & Contractors', type: 'B2B', gstin: '27AAKFP7316N1ZN', stateCode: '27', city: 'Mumbai',
    billingAddress: 'Unit 12, Marol Industrial Estate, Andheri East, Mumbai 400059', shippingAddress: 'Unit 12, Marol Industrial Estate, Andheri East, Mumbai 400059',
    phone: '+91 90000 02001', email: 'accounts@patelinteriors.example', termsDays: 15 },
  { name: 'Om Sai Builders', type: 'B2B', gstin: '27AAMFO5528R1ZC', stateCode: '27', city: 'Thane',
    billingAddress: '2nd Floor, Om Chambers, Gokhale Road, Thane West 400602', shippingAddress: 'Site: Om Sai Heights, Kolshet Road, Thane 400607',
    phone: '+91 90000 02002', email: 'office@omsaibuilders.example', termsDays: 30 },
  { name: 'Surat Lighting House', type: 'B2B', gstin: '24AAHFS2290Q1ZO', stateCode: '24', city: 'Surat',
    billingAddress: '14, Ring Road Market, Ring Road, Surat 395002', shippingAddress: '14, Ring Road Market, Ring Road, Surat 395002',
    phone: '+91 90000 02003', email: 'sales@suratlighting.example', termsDays: 15 },
  { name: 'Navkar Electrical Traders', type: 'B2B', gstin: '24AAQFN6043L1ZV', stateCode: '24', city: 'Ahmedabad',
    billingAddress: '7, Navkar Complex, Relief Road, Ahmedabad 380001', shippingAddress: '7, Navkar Complex, Relief Road, Ahmedabad 380001',
    phone: '+91 90000 02004', email: 'navkar@traders.example', termsDays: 30 },
  { name: 'Rohan Deshmukh', type: 'B2C', stateCode: '27', city: 'Dombivli',
    billingAddress: 'B-204, Shivai Apartments, Dombivli East 421201', shippingAddress: 'B-204, Shivai Apartments, Dombivli East 421201',
    phone: '+91 90000 02005', email: '', termsDays: 0 },
  { name: 'Sneha Kulkarni (home renovation)', type: 'B2C', stateCode: '27', city: 'Kalyan',
    billingAddress: 'Flat 7, Ganesh Kunj, Barave Road, Kalyan West 421301', shippingAddress: 'Flat 7, Ganesh Kunj, Barave Road, Kalyan West 421301',
    phone: '+91 90000 02006', email: 'sneha.k@mail.example', termsDays: 0 },
];

// area, city, addressStem
const B2B_NAMES: [string, string, string][] = [
  ['Dadar Electrical Mart', 'Mumbai', 'Gala 3, Dadar Market, Dadar West, Mumbai 400028'],
  ['Kohinoor Wiring Works', 'Mumbai', '21, Kohinoor Estate, Dadar East, Mumbai 400014'],
  ['Borivali Power Solutions', 'Mumbai', 'Shop 9, SV Road, Borivali West, Mumbai 400092'],
  ['Shakti Electricals & Hardware', 'Mumbai', '5, Shakti Plaza, Chandavarkar Road, Borivali West, Mumbai 400092'],
  ['Kurla Lighting Co.', 'Mumbai', 'Gala 14, LBS Marg, Kurla West, Mumbai 400070'],
  ['Bharat Cable Traders', 'Mumbai', '3, Kamani Industrial Estate, Kurla West, Mumbai 400070'],
  ['Vashi Electro Supplies', 'Navi Mumbai', 'Shop 22, Sector 17, Vashi, Navi Mumbai 400703'],
  ['Nerul Switchgear Agency', 'Navi Mumbai', 'Unit 6, Sector 11, Nerul, Navi Mumbai 400706'],
  ['Gokul Electricals', 'Thane', '12, Gokul Arcade, Naupada, Thane West 400602'],
  ['Thane Smart Homes LLP', 'Thane', '4th Floor, Viviana Tower, Eastern Express Highway, Thane 400604'],
  ['Bhiwandi Power Traders', 'Bhiwandi', 'Gala 31, Kalher Godown Complex, Bhiwandi 421302'],
  ['Lakshmi Cables & Wires', 'Bhiwandi', '8, Padgha Road, Bhiwandi 421302'],
  ['Pune Electro Hub', 'Pune', '18, Laxmi Road, Budhwar Peth, Pune 411002'],
  ['Deccan Lighting Solutions', 'Pune', 'Shop 5, FC Road, Shivajinagar, Pune 411004'],
  ['Hinjewadi Projects & Electricals', 'Pune', 'Plot 40, Phase 1, Hinjewadi, Pune 411057'],
];
const B2C_NAMES: [string, string, string][] = [
  ['Anita Joshi', 'Kalyan', 'C-12, Saraswati Society, Kalyan East 421306'],
  ['Mahesh Pawar', 'Ulhasnagar', '3/14, Camp 3, Ulhasnagar 421003'],
  ['Farah Shaikh', 'Bhiwandi', 'Room 4, Nizampura, Bhiwandi 421302'],
  ['Vikas Gaikwad', 'Titwala', 'Row House 6, Gandhare Road, Titwala 421605'],
];
const STATE_OF = (city: string) => '27';

export function buildCustomers(rng: Rng): Customer[] {
  const out: Omit<Customer, 'id'>[] = [...GIVEN];
  let phone = 2007;
  for (const [name, city, addr] of B2B_NAMES) {
    const pan = `${rng.pick(['A', 'B', 'C', 'K', 'S'])}${rng.pick(['A', 'B', 'D', 'E', 'M'])}${rng.pick(['F', 'F', 'C', 'H'])}${rng.pick(['F', 'C', 'P'])}${rng.pick(['A', 'B', 'S', 'T'])}${String(rng.int(1000, 9999))}${rng.pick(['K', 'L', 'M', 'N', 'R', 'Q'])}`;
    out.push({
      name, type: 'B2B', gstin: makeGstin('27', pan, '1'), stateCode: STATE_OF(city), city, billingAddress: addr, shippingAddress: addr,
      phone: `+91 90000 0${phone++}`, email: `accounts@${name.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 14)}.example`,
      termsDays: rng.pick([15, 15, 30, 7]),
    });
  }
  for (const [name, city, addr] of B2C_NAMES) {
    out.push({ name, type: 'B2C', stateCode: '27', city, billingAddress: addr, shippingAddress: addr, phone: `+91 90000 0${phone++}`, email: '', termsDays: 0 });
  }
  return out.map((c, i) => ({ id: `cust-${String(i + 1).padStart(2, '0')}`, ...c }));
}
