import { getDb } from './db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { Contact, IdentifyRequest, IdentifyResponse } from './types';

export async function identify(request: IdentifyRequest): Promise<IdentifyResponse> {
  const pool = await getDb();
  const { email, phoneNumber } = request;

  // 1. Find contacts matching email or phone (not deleted)
  let query = `
    SELECT * FROM Contact 
    WHERE (email = ? OR phoneNumber = ?) AND deletedAt IS NULL
  `;
  const [rows] = await pool.query<RowDataPacket[]>(query, [email, phoneNumber]);
  let contacts = rows as Contact[];

  // If no contacts, create a new primary
  if (contacts.length === 0) {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO Contact (phoneNumber, email, linkPrecedence) VALUES (?, ?, 'primary')`,
      [phoneNumber || null, email || null]
    );
    const newId = result.insertId;
    // Fetch the new contact
    const [newRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM Contact WHERE id = ?`,
      [newId]
    );
    const newContact = newRows[0] as Contact;
    return {
      contact: {
        primaryContactId: newId,
        emails: newContact.email ? [newContact.email] : [],
        phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
        secondaryContactIds: []
      }
    };
  }

  // 2. Gather all related contacts (including those linked via primaries)
  let allContactIds = new Set<number>();
  contacts.forEach(c => allContactIds.add(c.id));

  for (const c of contacts) {
    if (c.linkedId) {
      allContactIds.add(c.linkedId);
    }
  }

  // Fetch all contacts whose id is in set OR linkedId is in set
  if (allContactIds.size > 0) {
    const placeholders = Array.from(allContactIds).map(() => '?').join(',');
    const [moreRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM Contact 
       WHERE id IN (${placeholders}) OR linkedId IN (${placeholders}) AND deletedAt IS NULL`,
      [...Array.from(allContactIds), ...Array.from(allContactIds)]
    );
    const moreContacts = moreRows as Contact[];
    for (const mc of moreContacts) {
      if (!contacts.some(c => c.id === mc.id)) {
        contacts.push(mc);
      }
    }
  }

  // Determine primary contact(s)
  const allPrimaries = contacts.filter(c => c.linkPrecedence === 'primary');
  let primaryContact: Contact;

  if (allPrimaries.length === 1) {
    primaryContact = allPrimaries[0];
  } else if (allPrimaries.length > 1) {
    allPrimaries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    primaryContact = allPrimaries[0];
    for (let i = 1; i < allPrimaries.length; i++) {
      const otherPrimary = allPrimaries[i];
      await pool.query(
        `UPDATE Contact SET linkPrecedence = 'secondary', linkedId = ? WHERE id = ?`,
        [primaryContact.id, otherPrimary.id]
      );
    }
  } else {
    throw new Error('No primary contact found');
  }

  // Gather all linked contacts (including secondaries)
  const [allLinkedRows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM Contact 
     WHERE id = ? OR linkedId = ? OR linkedId IN (SELECT id FROM Contact WHERE linkedId = ?) AND deletedAt IS NULL`,
    [primaryContact.id, primaryContact.id, primaryContact.id]
  );
  const allLinked = allLinkedRows as Contact[];

  const emails: string[] = [];
  const phoneNumbers: string[] = [];
  const secondaryIds: number[] = [];

  if (primaryContact.email) emails.push(primaryContact.email);
  if (primaryContact.phoneNumber) phoneNumbers.push(primaryContact.phoneNumber);

  for (const contact of allLinked) {
    if (contact.id === primaryContact.id) continue;
    if (contact.email && !emails.includes(contact.email)) emails.push(contact.email);
    if (contact.phoneNumber && !phoneNumbers.includes(contact.phoneNumber)) phoneNumbers.push(contact.phoneNumber);
    secondaryIds.push(contact.id);
  }

  // Check if we need to create a new secondary for the incoming request
  const emailExists = emails.includes(email || '');
  const phoneExists = phoneNumbers.includes(phoneNumber || '');
  const shouldCreateSecondary = (email && !emailExists) || (phoneNumber && !phoneExists);

  if (shouldCreateSecondary) {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO Contact (phoneNumber, email, linkedId, linkPrecedence) VALUES (?, ?, ?, 'secondary')`,
      [phoneNumber || null, email || null, primaryContact.id]
    );
    const newSecId = result.insertId;
    if (email && !emails.includes(email)) emails.push(email);
    if (phoneNumber && !phoneNumbers.includes(phoneNumber)) phoneNumbers.push(phoneNumber);
    secondaryIds.push(newSecId);
  }

  return {
    contact: {
      primaryContactId: primaryContact.id,
      emails,
      phoneNumbers,
      secondaryContactIds: secondaryIds
    }
  };
}